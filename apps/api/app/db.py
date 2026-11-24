import sqlite3
from contextlib import contextmanager
from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS regions(id TEXT PRIMARY KEY, name TEXT, level TEXT, parent_id TEXT, centroid_lng REAL, centroid_lat REAL, area_km2 REAL);
CREATE INDEX IF NOT EXISTS ix_reg_level ON regions(level, parent_id);
CREATE TABLE IF NOT EXISTS indicators(id TEXT PRIMARY KEY, name TEXT, theme TEXT, unit TEXT, direction TEXT, key_indicator INT, description TEXT, formula TEXT);
CREATE TABLE IF NOT EXISTS observations(region_id TEXT, indicator_id TEXT, year INT, value REAL, is_dummy INT DEFAULT 1, source TEXT, PRIMARY KEY(region_id, indicator_id, year));
CREATE INDEX IF NOT EXISTS ix_obs ON observations(indicator_id, year);
CREATE TABLE IF NOT EXISTS estimates(region_id TEXT, indicator_id TEXT, year INT, value REAL, method TEXT, PRIMARY KEY(region_id, indicator_id, year));
CREATE TABLE IF NOT EXISTS models(id INTEGER PRIMARY KEY AUTOINCREMENT, indicator_id TEXT, level TEXT, algo TEXT, version TEXT, metrics_json TEXT, trained_at TEXT, is_active INT DEFAULT 1);
CREATE TABLE IF NOT EXISTS forecasts(region_id TEXT, indicator_id TEXT, year INT, yhat REAL, lo80 REAL, hi80 REAL, lo95 REAL, hi95 REAL, model_id INT, PRIMARY KEY(region_id, indicator_id, year, model_id));
CREATE INDEX IF NOT EXISTS ix_fc ON forecasts(indicator_id, year, model_id);
CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, status TEXT, message TEXT, started_at TEXT, finished_at TEXT);
"""


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


@contextmanager
def db():
    c = connect()
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init():
    with db() as c:
        c.executescript(SCHEMA)
