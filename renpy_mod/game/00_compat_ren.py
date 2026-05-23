## DDLC Together — Python 3.10+ type-annotation compatibility shim.
##
## DDLCModTemplate2.0 uses PEP 604 syntax (`str | None`) in several
## `_ren.py` files (notably `game/definitions/py/core_ren.py`).  Ren'Py
## 8.3 bundles Python 3.9 which evaluates that expression at function
## definition time and raises `TypeError: unsupported operand type(s)
## for |: 'type' and 'NoneType'`.
##
## We flip `config.future_annotations = True` inside a `python early`
## block placed in `00_compat_ren.py` so that:
##   1) the leading "00_" makes this file load alphabetically first;
##   2) `python early` executes immediately after this file is parsed,
##      BEFORE any other `_ren.py` is compiled (see renpy/script.py:601);
##   3) every subsequent module is then compiled with PEP 563 deferred
##      annotation evaluation, neutralising PEP 604 at runtime.

import renpy  # type: ignore

"""renpy
python early:
"""

renpy.config.future_annotations = True
