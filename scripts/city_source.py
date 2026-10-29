"""Self-contained public city-data transformation for export_data.py.

Coordinates are representative city centres, not hospitals or street addresses.
Country labels, display-name overrides, alias normalization and duplicate labels
are maintained here so rebuilding needs no sibling project or private files.
IANA identifiers are validated against the pinned packaged tzdata release.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import math
import re
import unicodedata
from importlib.resources import files


_COUNTRIES_ZH = {
    "CN": "中国", "HK": "中国香港", "MO": "中国澳门", "TW": "中国台湾",
    "US": "美国", "GB": "英国", "FR": "法国", "DE": "德国", "IT": "意大利",
    "ES": "西班牙", "PT": "葡萄牙", "NL": "荷兰", "BE": "比利时",
    "CH": "瑞士", "AT": "奥地利", "IE": "爱尔兰", "SE": "瑞典",
    "NO": "挪威", "DK": "丹麦", "FI": "芬兰", "IS": "冰岛",
    "PL": "波兰", "CZ": "捷克", "GR": "希腊", "HU": "匈牙利",
    "RU": "俄罗斯", "UA": "乌克兰", "TR": "土耳其", "CA": "加拿大",
    "AU": "澳大利亚", "NZ": "新西兰", "JP": "日本", "KR": "韩国",
    "SG": "新加坡", "MY": "马来西亚", "TH": "泰国", "VN": "越南",
    "PH": "菲律宾", "ID": "印度尼西亚", "IN": "印度", "NP": "尼泊尔",
    "AE": "阿联酋", "IL": "以色列", "EG": "埃及", "ZA": "南非",
    "BR": "巴西", "AR": "阿根廷", "MX": "墨西哥", "CL": "智利",
}

# Display names and a few familiar Chinese names complement, rather than replace,
# GeoNames' multilingual alternate names. Keys are the stable GeoNames IDs.
_CITY_ZH = {
    1816670: ("北京", "北京市", "北京巿", "Peking"),
    1796236: ("上海", "上海市"),
    1809858: ("广州", "廣州", "广州市", "Canton"),
    1795565: ("深圳", "深圳市"),
    1815286: ("成都", "成都市"),
    1814906: ("重庆", "重慶", "重庆市", "Chungking"),
    1791247: ("武汉", "武漢", "武汉市"),
    1790630: ("西安", "西安市", "Xi'an", "Xian"),
    1808926: ("杭州", "杭州市"),
    1799962: ("南京", "南京市", "Nanking"),
    1819729: ("香港", "香港岛", "香港島", "Hong Kong"),
    1821274: ("澳门", "澳門", "Macao"),
    1668341: ("台北", "臺北", "台北市", "臺北市"),
    2643743: ("伦敦", "倫敦"),
    5128581: ("纽约", "紐約", "纽约市", "紐約市", "NYC"),
    2988507: ("巴黎",),
    1850147: ("东京", "東京"),
    1835848: ("首尔", "首爾", "汉城", "漢城"),
    1880252: ("新加坡", "狮城", "獅城"),
    2147714: ("悉尼", "雪梨"),
    2158177: ("墨尔本", "墨爾本"),
    5368361: ("洛杉矶", "洛杉磯"),
    5391959: ("旧金山", "舊金山", "三藩市"),
    6167865: ("多伦多", "多倫多"),
    6173331: ("温哥华", "溫哥華"),
    1609350: ("曼谷",),
    1735161: ("吉隆坡",),
    1275339: ("孟买", "孟買", "Bombay"),
    524901: ("莫斯科",),
    2950159: ("柏林",),
    3169070: ("罗马", "羅馬"),
    3117735: ("马德里", "馬德里"),
}

COMMON_CITY_IDS = (1816670, 1796236, 1809858, 1795565, 1815286, 1814906,
               1819729, 1668341, 2643743, 5128581, 1850147, 1880252)


def _normalise(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).casefold()
    return "".join(c for c in value if c.isalnum() and not unicodedata.combining(c))


@dataclass(frozen=True)
class _Place:
    data: dict
    primary: str
    aliases: tuple[str, ...]
    population: int


@lru_cache(maxsize=1)
def load_city_records() -> dict[int, _Place]:
    import geonamescache

    gc = geonamescache.GeonamesCache()
    countries = gc.get_countries()
    us_states = gc.get_us_states()
    zones = set(get_timezones())
    records: dict[int, _Place] = {}
    for raw in gc.get_cities().values():
        try:
            identity = int(raw["geonameid"])
            lat, lon = float(raw["latitude"]), float(raw["longitude"])
            timezone = str(raw["timezone"])
            if not (math.isfinite(lat) and math.isfinite(lon)
                    and -90 <= lat <= 90 and -180 <= lon <= 180 and timezone in zones):
                continue
            code = str(raw["countrycode"])
            country = _COUNTRIES_ZH.get(code, countries.get(code, {}).get("name", code))
            original_name = str(raw["name"]).strip()
            known_names = _CITY_ZH.get(identity, ())
            alternate = raw.get("alternatenames", raw.get("alternateNames", []))
            if isinstance(alternate, str):
                alternate = alternate.split(",")
            display = known_names[0] if known_names else original_name
            if not known_names and code in {"CN", "HK", "MO", "TW"}:
                chinese_names = [n for n in alternate if isinstance(n, str)
                                 and re.fullmatch(r"[\u3400-\u9fff]{2,12}", n)]
                if chinese_names:
                    # GeoNames commonly lists simplified, then traditional names.
                    # Stable tie order preserves that source ordering.
                    display = min(chinese_names, key=len)
            admin_code = str(raw.get("admin1code", ""))
            admin = ""
            if code == "US":
                admin = us_states.get(admin_code, {}).get("name", admin_code)
            label_parts = [display]
            if admin and _normalise(admin) != _normalise(display):
                label_parts.append(admin)
            label_parts.extend([country, "城市中心"])
            data = {"id": str(identity), "name": display, "country": country,
                    "admin": admin, "latitude": lat, "longitude": lon,
                    "timezone": timezone, "label": " · ".join(label_parts)}
            aliases = {_normalise(n) for n in
                       (original_name, str(raw.get("asciiname", "")), *known_names,
                        *alternate) if isinstance(n, str) and n.strip()}
            aliases.discard("")
            # Compound searches such as "中国北京", "北京 China" and "London UK".
            country_names = (country, code, countries.get(code, {}).get("name", ""))
            if code == "GB":
                country_names += ("UK",)
            for city_name in (display, original_name):
                for country_name in country_names:
                    aliases.add(_normalise(city_name + country_name))
                    aliases.add(_normalise(country_name + city_name))
            population = max(0, int(raw.get("population", 0)))
            record = _Place(data, _normalise(original_name), tuple(sorted(aliases)), population)
            records[identity] = record
        except (KeyError, TypeError, ValueError):
            # A malformed city must not produce an invalid coordinate/time zone.
            continue
    if not records:
        raise RuntimeError("本地城市数据库未能载入，请检查 geonamescache 与时区数据。")
    # Same-name towns outside the US may lack a human-readable subdivision in
    # this bundled database. Distinguish those labels by their coordinates.
    names: dict[tuple[str, str], list[_Place]] = {}
    for record in records.values():
        names.setdefault((record.data["name"], record.data["country"]), []).append(record)
    for duplicates in names.values():
        if len(duplicates) > 1:
            for record in duplicates:
                if not record.data["admin"]:
                    record.data["label"] += (f" · {record.data['latitude']:.4f}°, "
                                             f"{record.data['longitude']:.4f}°")
    return records


@lru_cache(maxsize=1)
def _timezone_ids() -> tuple[str, ...]:
    return tuple(sorted(name for name in files("tzdata").joinpath("zones").read_text().splitlines()
                        if name and name not in {"Factory", "localtime"}))


def get_timezones() -> list[str]:
    """IANA identifiers from the pinned tzdata package, independent of the OS."""
    return list(_timezone_ids())
