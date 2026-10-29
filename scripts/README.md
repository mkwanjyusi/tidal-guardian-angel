# 城市与时区数据导出

浏览器直接使用 `public/data/places.json` 和 `public/data/timezones.json`。以下脚本只供维护者重新生成数据，网站运行不需要 Python。

在项目根目录使用 Python 3.12 创建环境并安装固定版本：

```sh
python3.12 -m venv .data-venv
.data-venv/bin/python -m pip install -r scripts/requirements.txt
```

先检查重新生成的内容是否与当前文件逐字节一致。此命令不写入文件：

```sh
.data-venv/bin/python scripts/export_data.py --check
```

需要比较或检查新结果时，可以导出到单独的目录：

```sh
.data-venv/bin/python scripts/export_data.py --output-dir /tmp/guardian-data-review
```

确认后重新生成项目内的数据：

```sh
.data-venv/bin/python scripts/export_data.py
```

`city_source.py` 保存公开城市数据的转换规则、中文名称、别名和同名地点标签。脚本只依赖同目录文件与上面的两个包，不需要其他项目目录。城市数据来自 GeoNames，经 geonamescache 3.0.2 提供；使用时应保留 GeoNames 的 CC BY 4.0 署名。坐标代表城市中心，未覆盖全部区县或具体出生地址。

时区固定为 tzdata 2026.6／IANA 2026f，覆盖 UTC 1799 年初至 2102 年初，供 1800–2100 年出生日期使用。历史转换直接读取此版本的 TZif，不通过采样推断；TZif 尾部的未来 POSIX 规则由同一版本的 `ZoneInfo` 展开到秒。构建不会读取操作系统的时区数据库。

每次导出会打印文件体积与 SHA-256。更新依赖版本会改变数据，需同时核验地点、历史夏令时和网站计算结果，再更新固定版本与相关说明。
