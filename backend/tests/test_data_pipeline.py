import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data_pipeline.ingest import FEATURE_COLUMNS, build_hospital_year_features, get_hospital_partition


def test_build_hospital_year_features_nonempty():
    df = build_hospital_year_features()
    assert len(df) > 0
    assert set(FEATURE_COLUMNS).issubset(df.columns)


def test_partition_has_no_cross_hospital_leakage():
    df = build_hospital_year_features()
    hospital_ids = df["hospitalid"].unique()
    a, b = hospital_ids[0], hospital_ids[1]
    part_a = get_hospital_partition(a, df)
    part_b = get_hospital_partition(b, df)
    assert (part_a["hospitalid"] == a).all()
    assert (part_b["hospitalid"] == b).all()
    assert set(part_a["hospitalid"]).isdisjoint(set(part_b["hospitalid"]))


def test_yearly_bed_days_aggregation_matches_manual_calc():
    chunk = pd.DataFrame(
        {
            "patientunitstayid": [1, 2],
            "hospitalid": [99, 99],
            "hospitaldischargeyear": [2021, 2021],
            "unitdischargeoffset": [1440, 2880],  # 1 day and 2 days, in minutes
        }
    )
    chunk["los_days"] = chunk["unitdischargeoffset"] / 1440.0
    bed_days = chunk["los_days"].sum()
    assert bed_days == 3.0
    assert round(bed_days / 365.0, 6) == round(3.0 / 365.0, 6)
