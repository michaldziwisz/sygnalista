from __future__ import annotations

import locale
import platform
import sys
import time
from typing import Any


def collect_diagnostics(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    os_info = {
        "system": platform.system(),
        "release": platform.release(),
        "version": platform.version(),
        "machine": platform.machine(),
    }

    py_info = {
        "python_version": platform.python_version(),
        "implementation": platform.python_implementation(),
        "executable": sys.executable,
    }

    loc_info = {
        "locale": locale.getlocale(),
        "preferred_encoding": locale.getpreferredencoding(False),
        "tzname": time.tzname,
    }

    diagnostics: dict[str, Any] = {
        "os": os_info,
        "python": py_info,
        "locale": loc_info,
    }

    if extra:
        diagnostics["extra"] = extra

    return diagnostics

