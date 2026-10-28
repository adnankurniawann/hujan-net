import numpy as np
import pandas as pd
import pytest
import xarray as xr

from hujannet_ml.wetdry import link_features, minute_loss, scores, to_long, tune_threshold

T0 = pd.Timestamp("2021-07-01")


def test_scores():
    y = np.array([1, 1, 0, 0, 1, 0], bool)
    p = np.array([1, 0, 1, 0, 1, 0], bool)
    s = scores(y, p)
    assert s["pod"] == pytest.approx(2 / 3)
    assert s["far"] == pytest.approx(1 / 3)
    assert s["csi"] == pytest.approx(2 / 4)
    assert s["mcc"] == pytest.approx((2 * 2 - 1 * 1) / np.sqrt(3 * 3 * 3 * 3))
    assert scores(y, y)["mcc"] == pytest.approx(1.0)


def test_tune_threshold_separates():
    score = np.r_[np.linspace(0, 0.4, 90), np.linspace(0.6, 1, 10)]
    y = score > 0.5
    assert scores(y, score > tune_threshold(score, y))["mcc"] == pytest.approx(1.0)


def test_link_features_rain_step_and_no_lookahead():
    minutes = pd.date_range(T0, periods=2 * 1440, freq="1min")
    loss = pd.DataFrame({"a|s1": np.full(len(minutes), 50.0, np.float32)}, index=minutes)
    rain = (minutes >= T0 + pd.Timedelta(hours=30)) & (minutes < T0 + pd.Timedelta(hours=30, minutes=30))
    loss.loc[rain, "a|s1"] += 5.0
    times = pd.DatetimeIndex([T0 + pd.Timedelta(hours=30), T0 + pd.Timedelta(hours=30, minutes=15), T0 + pd.Timedelta(hours=29)])

    f = link_features(loss, times, window_min=15)
    dip, rule = f["dip_mean"]["a|s1"], f["rule_wet"]["a|s1"]
    assert dip.iloc[0] == pytest.approx(0)          # cap waktu tepat saat hujan mulai: belum terlihat
    assert dip.iloc[1] == pytest.approx(5)          # 15 menit pertama hujan
    assert rule.iloc[1] == 1 and rule.iloc[0] == 0 and rule.iloc[2] == 0
    assert f["range60"]["a|s1"].iloc[1] == pytest.approx(5)


def test_minute_loss_and_to_long():
    t = pd.date_range(T0, periods=3, freq="1min")
    ds = xr.Dataset(
        {"rsl": (("cml_id", "sublink_id", "time"), np.array([[[-50, -51, -52], [-60, -60, -60]]], np.float32)),
         "tsl": (("cml_id", "sublink_id", "time"), np.full((1, 2, 3), 10, np.float32))},
        coords={"cml_id": ["7"], "sublink_id": ["s1", "s2"], "time": t,
                "frequency": (("cml_id", "sublink_id"), [[23000.0, 18000.0]]), "length": ("cml_id", [4200.0]),
                "polarization": (("cml_id", "sublink_id"), [["v", "h"]])},
    )
    loss, meta = minute_loss(ds)
    assert list(loss.columns) == ["7|s1", "7|s2"]
    np.testing.assert_array_equal(loss["7|s1"], [60, 61, 62])
    assert list(meta.freq_ghz) == [23, 18] and list(meta.length_km) == [4.2, 4.2] and list(meta.pol) == ["v", "h"]

    feats = {k: pd.DataFrame(1.0, index=t[1:], columns=loss.columns) for k in ("dip_mean", "dip_max", "std5_max", "std60", "range60", "rule_wet")}
    ref = pd.DataFrame({"7": [0.0, 2.0, np.nan]}, index=t)
    df = to_long(feats, ref, meta)
    assert len(df) == 2  # cap waktu ketiga tidak punya label
    assert list(df.ref_mm_h) == [2.0, 2.0] and list(df.freq_ghz) == [23, 18]
