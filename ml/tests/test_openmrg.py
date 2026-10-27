import netCDF4
import numpy as np
import pandas as pd
import pytest
import xarray as xr

from hujannet_ml.openmrg import cml_to_minutes, path_average, radar_rain

T0 = 1433116740  # awal menit, sama dengan berkas asli


@pytest.fixture
def raw_cml(tmp_path):
    # Dua link: 10001 punya arah A dan B, 10002 hanya arah A.
    # Kolom NetCDF sengaja tidak berurut sama dengan metadata.
    meta = pd.DataFrame({
        "Link": [10001, 10001, 10002],
        "Direction": ["A", "B", "A"],
        "Sublink": [5, 7, 9],
        "NearLatitude_DecDeg": [57.0, 57.1, 57.2],
        "NearLongitude_DecDeg": [11.0, 11.1, 11.2],
        "FarLatitude_DecDeg": [57.1, 57.0, 57.3],
        "FarLongitude_DecDeg": [11.1, 11.0, 11.3],
        "Frequency_GHz": [28.2, 29.2, 7.5],
        "Polarization": ["Vertical", "Vertical", "Horizontal"],
        "Length_km": [0.7, 0.7, 2.0],
    })
    meta.to_csv(tmp_path / "meta.csv", index=False)

    sublinks = [9, 5, 7]
    n = 3 * 6 + 2  # tiga menit penuh plus sisa yang harus dibuang
    rsl = np.zeros((n, 3), np.float32)
    rsl[:, 0] = -40.0                      # sublink 9 tetap
    rsl[:, 1] = np.arange(n) % 6 - 50.0    # sublink 5: rata rata menit = -47,5
    rsl[:, 2] = -60.0
    rsl[6:12, 2] = 1e10                    # sublink 7 hilang seluruh menit kedua
    rsl[0, 1] = 1e10                       # satu cuplikan hilang, menit tetap ada

    nc = netCDF4.Dataset(tmp_path / "cml.nc", "w")
    nc.createDimension("time", n)
    nc.createDimension("sublink", 3)
    nc.createVariable("time", "i4", ("time",))[:] = T0 + 10 * np.arange(n)
    nc.createVariable("sublink", "i4", ("sublink",))[:] = sublinks
    for v in ("rsl", "tsl"):
        var = nc.createVariable(v, "f4", ("time", "sublink"), fill_value=np.float32(1e10))
        var[:] = rsl if v == "rsl" else np.full_like(rsl, 10.0)
    nc.close()
    return tmp_path


def test_cml_to_minutes(raw_cml):
    ds = cml_to_minutes(raw_cml / "cml.nc", raw_cml / "meta.csv", block_min=2)

    assert ds.rsl.dims == ("cml_id", "sublink_id", "time")
    assert list(ds.cml_id.values) == ["10001", "10002"]
    assert ds.sizes["time"] == 3
    assert ds.time.values[0] == np.datetime64(pd.Timestamp(T0, unit="s"))

    r = ds.rsl.sel(cml_id="10001")
    np.testing.assert_allclose(r.sel(sublink_id="sublink_1")[1:], -47.5)
    np.testing.assert_allclose(r.sel(sublink_id="sublink_1")[0], np.mean([-49, -48, -47, -46, -45]))
    assert np.isnan(r.sel(sublink_id="sublink_2")[1])
    assert np.isnan(ds.rsl.sel(cml_id="10002", sublink_id="sublink_2")).all()
    np.testing.assert_allclose(ds.rsl.sel(cml_id="10002", sublink_id="sublink_1"), -40.0)

    assert ds.frequency.sel(cml_id="10001", sublink_id="sublink_2") == pytest.approx(29200)
    assert ds.polarization.sel(cml_id="10002", sublink_id="sublink_1") == "h"
    assert ds.length.sel(cml_id="10002") == pytest.approx(2000)
    assert ds.site_0_lat.sel(cml_id="10001") == 57.0  # dari arah A


def test_radar_rain(tmp_path):
    nc = netCDF4.Dataset(tmp_path / "radar.nc", "w")
    for d, n in (("time", 1), ("y", 2), ("x", 2)):
        nc.createDimension(d, n)
    nc.createVariable("time", "i4", ("time",))[:] = [T0]
    data = nc.createVariable("data", "i4", ("time", "y", "x"))
    data.scale_factor, data.add_offset, data.missing_value = np.float32(0.4), np.float32(-30.0), np.int32(255)
    nc.set_auto_maskandscale(False)
    data[:] = np.array([[[133, 255], [0, 133]]], np.int32)
    for v in ("lat", "lon"):
        nc.createVariable(v, "f4", ("y", "x"))[:] = 0
    nc.close()

    r = radar_rain(tmp_path / "radar.nc")["rainfall_rate"].values[0]
    dbz = 0.4 * 133 - 30
    assert r[0, 0] == pytest.approx((10 ** (dbz / 10) / 200) ** (1 / 1.5), rel=1e-5)
    assert np.isnan(r[0, 1])
    assert r[1, 0] < 1e-3


def test_path_average_uniform_field():
    lon, lat = np.meshgrid(np.linspace(11.0, 11.2, 5), np.linspace(57.0, 57.2, 5))
    rain = xr.DataArray(np.full((2, 5, 5), 3.0), dims=("time", "y", "x"),
                        coords={"time": [0, 1], "lon": (("y", "x"), lon), "lat": (("y", "x"), lat)})
    cmls = xr.Dataset(coords={
        "cml_id": ["a"],
        "site_0_lon": ("cml_id", [11.03]), "site_0_lat": ("cml_id", [57.03]),
        "site_1_lon": ("cml_id", [11.17]), "site_1_lat": ("cml_id", [57.12]),
    })
    np.testing.assert_allclose(path_average(rain, cmls).values, 3.0)
