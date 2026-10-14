"""Chunked ingestion of local eICU-style CSVs into a per-hospital, per-year ICU
occupancy feature table.

Data constraint: the source CSVs have no shared absolute calendar -- only
offsets in minutes relative to each patient's own unit-admit time, plus
hospitaldischargeyear. True hour-by-hour cross-patient bed occupancy can't be
reconstructed from this, so occupancy is aggregated at year granularity
(occupied-bed-days -> average daily occupancy) instead of a literal 24h series.
# ponytail: yearly granularity, not literal 24h. Upgrade path: a synthetic
# calendar generator assigning each stay an absolute admit date, if real
# daily/hourly forecasting is needed later.

Only patient.csv, apachepatientresult.csv, and hospital.csv are read -- the
other CSVs (lab, medication, vitalperiodic, diagnosis, ...) aren't needed for
this baseline target and are left for later enrichment.
"""
from __future__ import annotations

import os
from functools import lru_cache

import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "DATA")
CHUNK_SIZE = 50_000

_BED_CATEGORY_MIDPOINT = {
    "<100": 50.0,
    "100 - 249": 174.5,
    "250 - 499": 374.5,
    "500 - 999": 749.5,
    ">= 1000": 1200.0,
}
_REGIONS = ["Midwest", "Northeast", "South", "West"]

FEATURE_COLUMNS = [
    "num_admissions",
    "avg_los_days",
    "avg_apache_score",
    "bed_capacity_mid",
    "teaching",
] + [f"region_{r.lower()}" for r in _REGIONS]
LABEL_COLUMN = "avg_daily_occupancy"


def _load_hospital_static_features() -> pd.DataFrame:
    h = pd.read_csv(os.path.join(DATA_DIR, "hospital.csv"))
    h["bed_capacity_mid"] = h["numbedscategory"].map(_BED_CATEGORY_MIDPOINT)
    h["teaching"] = h["teachingstatus"].astype(int)
    for region in _REGIONS:
        h[f"region_{region.lower()}"] = (h["region"] == region).astype(int)
    return h.set_index("hospitalid")[
        ["bed_capacity_mid", "teaching"] + [f"region_{r.lower()}" for r in _REGIONS]
    ]


def _load_apache_scores() -> pd.Series:
    """patientunitstayid -> acutephysiologyscore, read in chunks (~25MB file)."""
    scores: dict[int, float] = {}
    cols = ["patientunitstayid", "acutephysiologyscore"]
    for chunk in pd.read_csv(
        os.path.join(DATA_DIR, "apachepatientresult.csv"), usecols=cols, chunksize=CHUNK_SIZE
    ):
        scores.update(zip(chunk["patientunitstayid"], chunk["acutephysiologyscore"]))
    return pd.Series(scores, name="acutephysiologyscore")


@lru_cache(maxsize=1)
def build_hospital_year_features() -> pd.DataFrame:
    """Chunked scan of patient.csv (~47MB) -> per-(hospitalid, year) occupancy features.

    Only a small per-(hospital, year) running accumulator persists across
    chunks; each chunk of raw patient rows is discarded once aggregated.

    Cached (source CSVs are static for the lifetime of a process) so the API
    isn't re-scanning ~70MB of CSVs on every dashboard request. Callers never
    mutate the returned frame in place (all downstream helpers filter/copy),
    so sharing the cached object is safe.
    """
    apache_scores = _load_apache_scores()
    hospital_static = _load_hospital_static_features()

    cols = ["patientunitstayid", "hospitalid", "hospitaldischargeyear", "unitdischargeoffset"]
    accum: dict[tuple[int, int], dict] = {}

    for chunk in pd.read_csv(os.path.join(DATA_DIR, "patient.csv"), usecols=cols, chunksize=CHUNK_SIZE):
        chunk = chunk.copy()
        chunk["los_days"] = chunk["unitdischargeoffset"] / 1440.0
        chunk["apache_score"] = chunk["patientunitstayid"].map(apache_scores)
        grouped = chunk.groupby(["hospitalid", "hospitaldischargeyear"]).agg(
            num_admissions=("patientunitstayid", "count"),
            bed_days=("los_days", "sum"),
            apache_sum=("apache_score", "sum"),
        )
        for (hospitalid, year), row in grouped.iterrows():
            key = (int(hospitalid), int(year))
            slot = accum.setdefault(key, {"num_admissions": 0, "bed_days": 0.0, "apache_sum": 0.0})
            slot["num_admissions"] += int(row["num_admissions"])
            slot["bed_days"] += float(row["bed_days"])
            slot["apache_sum"] += float(row["apache_sum"])

    records = [
        {
            "hospitalid": hospitalid,
            "year": year,
            "num_admissions": slot["num_admissions"],
            "avg_los_days": slot["bed_days"] / slot["num_admissions"],
            "avg_daily_occupancy": slot["bed_days"] / 365.0,
            "avg_apache_score": slot["apache_sum"] / slot["num_admissions"],
        }
        for (hospitalid, year), slot in accum.items()
    ]
    df = pd.DataFrame.from_records(records).sort_values(["hospitalid", "year"]).reset_index(drop=True)
    return df.join(hospital_static, on="hospitalid")


def get_hospital_partition(hospitalid: int, features: pd.DataFrame | None = None) -> pd.DataFrame:
    """Return only one hospital's rows -- the data-isolation boundary each FL
    client (Phase 2) will rely on. Also builds the supervised (X, y) pairs:
    a year's features predict the *next* year's avg_daily_occupancy, since
    there's no within-year signal to forecast against (see module docstring).
    """
    if features is None:
        features = build_hospital_year_features()
    hosp = features[features["hospitalid"] == hospitalid].sort_values("year").reset_index(drop=True)
    hosp = hosp.copy()
    hosp["next_year_occupancy"] = hosp[LABEL_COLUMN].shift(-1)
    return hosp.dropna(subset=["next_year_occupancy"]).reset_index(drop=True)


def get_feature_scaler(features: pd.DataFrame | None = None) -> tuple[pd.Series, pd.Series]:
    """Mean/std of FEATURE_COLUMNS across ALL hospitals -- a fixed, deterministic
    function of the (locally-visible, in this single-machine simulation) dataset
    structure, so every client and the inference module compute the identical
    scaler independently, with nothing about it ever sent over the FL network.

    Deliberately global (not per-hospital) standardization: a single hospital's
    ~4 training rows produce a noisy, hospital-specific scale, which would make
    weights averaged across clients (and later, inference against the merged
    global model) numerically incoherent. Every FL client and the inference
    module must agree on one shared scale for the aggregated model's weights
    to mean the same thing everywhere they're applied.
    """
    if features is None:
        features = build_hospital_year_features()
    mean = features[FEATURE_COLUMNS].mean()
    std = features[FEATURE_COLUMNS].std().clip(lower=1e-6)
    return mean, std


def get_latest_hospital_row(hospitalid: int, features: pd.DataFrame | None = None) -> pd.Series:
    """The most recent year's row for one hospital -- used for live inference
    (predicting *next* year's demand), unlike get_hospital_partition which only
    returns rows that already have a known next-year label for training/eval.
    """
    if features is None:
        features = build_hospital_year_features()
    hosp = features[features["hospitalid"] == hospitalid].sort_values("year")
    if hosp.empty:
        raise ValueError(f"no data for hospital {hospitalid}")
    return hosp.iloc[-1]
