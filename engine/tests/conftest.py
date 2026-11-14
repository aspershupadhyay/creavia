"""pytest setup for the engine: tests import engine modules the way the engine does (from this folder), and need no
GPU, models or network. Run from the repo root: `python3 -m pytest engine`."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
