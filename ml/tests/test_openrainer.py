import gzip
import tarfile

import numpy as np
import pandas as pd
import pytest
import xarray as xr

from hujannet_ml import openrainer
from hujannet_ml.openrainer import clean_cmls, extract, month_reference, radar_rate


def cmls(rsl, pol=("Horizontal", "vertical")):
    return xr.Dataset(
        {"rsl": (("cml_id", "sublink_id", "time"), rsl), "tsl": (("cml_id", "sublink_id", "time"), np.full_like(rsl, 10.4))},
        coords={
            "cml_id": ["a"], "sublink_id": ["channel1", "channel2"],
            "time": pd.date_range("2021-07-01", periods=rsl.shape[-1], freq="1min"),
            "polarization": (("cml_id", "sublink_id"), np.array([pol], dtype=object)),
            "site_0_lon": ("cml_id", [11.002]), "site_0_lat": ("cml_id", [44.002]),
            "site_1_lon": ("cml_id", [11.030]), "site_1_lat": ("cml_id", [44.020]),
        },
    )


def radar(values):
    return xr.Dataset(
        {"rainfall_amount": (("time", "lat", "lon"), np.asarray(values, np.float32))},
        coords={"time": pd.date_range("2021-07-01T00:15", periods=len(values), freq="15min"),
                "lat": np.linspace(43.99, 44.03, np.shape(values)[1]),
                "lon": np.linspace(10.99, 11.04, np.shape(values)[2])},
    )


def test_extract_decompresses(tmp_path):
    src = tmp_path / "CML_202107.nc"
    cmls(np.zeros((1, 2, 2), np.float32)).to_netcdf(src)
    with open(src, "rb") as f, gzip.open(tmp_path / "CML_202107.nc.gz", "wb") as g:
        g.write(f.read())
    with tarfile.open(tmp_path / "CML.tar", "w") as t:
        t.add(tmp_path / "CML_202107.nc.gz", arcname="CML_202107.nc.gz")

    out = extract(tmp_path / "CML.tar")
    assert [p.name for p in out.rglob("*")] == ["CML_202107.nc"]
    assert xr.open_dataset(out / "CML_202107.nc").sizes["time"] == 2


def test_clean_cmls():
    ds = clean_cmls(cmls(np.array([[[-50.4, -50.6], [-60.0, np.nan]]])))
    assert ds.rsl.dtype == np.float32
    np.testing.assert_array_equal(ds.rsl.values[0, 0], [-50, -51])
    assert np.isnan(ds.rsl.values[0, 1, 1])
    assert (ds.tsl.values[0, :, 0] == 10).all()
    assert list(ds.polarization.values[0]) == ["h", "v"]


def test_radar_rate_to_mm_per_hour():
    r = radar_rate(radar([[[0.5, 0.0], [1.0, np.nan]]]))
    assert r.dims == ("time", "y", "x")
    assert r.lon.shape == (2, 2) and r.lat.values[1, 0] == pytest.approx(44.03)
    np.testing.assert_allclose(r.values[0, 0], [2.0, 0.0])
    assert np.isnan(r.values[0, 1, 1])


def test_month_reference_chunks_match_uniform_field(tmp_path, monkeypatch):
    monkeypatch.setattr(openrainer, "RADAR_CHUNK", 2)  # paksa beberapa potongan
    amounts = np.stack([np.full((5, 6), a) for a in (0.0, 0.25, 0.5, 1.0, 2.0)])
    radar(amounts).to_netcdf(tmp_path / "rad.nc")

    ref = month_reference(tmp_path / "rad.nc", cmls(np.zeros((1, 2, 1), np.float32)))
    assert ref.sizes["time"] == 5
    np.testing.assert_allclose(ref.sel(cml_id="a").values, [0, 1, 2, 4, 8], rtol=1e-5)
