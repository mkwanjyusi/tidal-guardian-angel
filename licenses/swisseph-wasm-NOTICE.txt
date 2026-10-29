NOTICE
======

This project is a derivative work of the Swiss Ephemeris.

Swiss Ephemeris
---------------
Copyright (C) 1997 - 2021 Astrodienst AG, Switzerland. All rights reserved.
Authors: Dieter Koch and Alois Treindl.

Upstream source: https://github.com/aloistr/swisseph
Documentation:   https://www.astro.com/swisseph
Vendored version: 2.10.03 (see vendor/swisseph/)

The C sources in vendor/swisseph/ are redistributed unmodified.


Licensing
---------
Swiss Ephemeris is made available by its authors under a dual licensing
system. A developer using any part of Swiss Ephemeris must choose one of:

  a) GNU Affero General Public License (AGPL)
  b) Swiss Ephemeris Professional License

THIS PROJECT CHOOSES (a), THE AGPL.

Consequently this entire project — including the WebAssembly build, the
TypeScript API layer, the build tooling, and the tests — is licensed under
the GNU Affero General Public License version 3 or later. See LICENSE.

What this means for you as a user of this package:

  If you use this package in software that you distribute, or in a service
  that users interact with over a network, the AGPL requires you to make
  the complete corresponding source code of your software available to
  those users under the AGPL or a compatible license.

  This is the "network copyleft" provision (AGPL section 13) and it is the
  key difference from the ordinary GPL. Running the software on a server
  and letting users interact with it counts as conveying it.

  If you cannot meet that obligation — for example because your product is
  closed source — you must obtain a Swiss Ephemeris Professional License
  directly from Astrodienst AG. That license is between you and
  Astrodienst; it is not granted by this project and cannot be sublicensed
  by us.

  See https://www.astro.com/swisseph/ for the Professional License.


Ephemeris data files
--------------------
The .se1 ephemeris data files are produced by Astrodienst AG from JPL
Development Ephemeris DE441 (NASA / Jet Propulsion Laboratory).

The data files are not contained in this repository. See the data package
documentation for how they are distributed and used.


Trademarks and attribution
--------------------------
"Swiss Ephemeris" is the work of Astrodienst AG. This project is an
independent port and is not affiliated with, endorsed by, or supported by
Astrodienst AG. Please do not direct support requests for this package to
the Swiss Ephemeris mailing list; use this project's issue tracker:

  https://github.com/kuntayerkus/swisseph-wasm/issues

Per the Swiss Ephemeris license conditions, the names of the authors and
of the copyright holder (Astrodienst) must not be used to endorse or
promote products derived from this software without specific prior written
permission.
