import gzip

import numpy as np
import pytest

from hujannet_ml.nl import rainlink_to_dataset

RAINLINK = """Frequency DateTime Pmin Pmax PathLength XStart YStart XEnd YEnd ID
38.0 201106011200 -50 -48 3.1 5.10 52.00 5.14 52.02 101
38.0 201106011215 -55 -49 3.1 5.10 52.00 5.14 52.02 101
38.0 201106011215 -99 -99 3.1 5.10 52.00 5.14 52.02 101
22.5 201106011215 -60.3 -59.9 8.0 4.90 51.90 4.99 51.95 202
"""


def test_rainlink_to_dataset(tmp_path):
    path = tmp_path / "cml.dat.gz"
    with gzip.open(path, "wt") as f:
        f.write(RAINLINK)

    ds = rainlink_to_dataset(path)

    assert ds.rsl_min.dims == ("cml_id", "time")
    assert list(ds.cml_id.values) == ["101", "202"]
    assert ds.sizes["time"] == 2
    np.testing.assert_allclose(ds.rsl_min.sel(cml_id="101"), [-50, -55])  # baris ganda dibuang
    assert np.isnan(ds.rsl_max.sel(cml_id="202").values[0])               # tidak ada data 12:00
    assert ds.rsl_max.sel(cml_id="202").values[1] == pytest.approx(-59.9)
    assert ds.frequency.sel(cml_id="202") == pytest.approx(22500)
    assert ds.length.sel(cml_id="101") == pytest.approx(3100)
    assert ds.site_1_lat.sel(cml_id="101") == pytest.approx(52.02)
