import numpy as np

from hujannet_ml.rainmap import NEIGHBOURS, idw, itu, mlp_inputs


def test_itu_matches_table_and_interpolates():
    k, a = itu(np.array([18.0, 18.0, 18.5]), np.array(["h", "v", "h"]))
    np.testing.assert_allclose(k[:2], [0.07078, 0.07708])
    np.testing.assert_allclose(a[:2], [1.0818, 1.0025])
    assert 0.07078 < k[2] < 0.08084


def test_idw_renormalises_over_links_with_data():
    w = np.array([[1.0, 3.0], [0.0, 0.0]])  # sel kedua di luar jangkauan
    x = np.array([[2.0, 6.0], [2.0, np.nan]], np.float32)
    out = idw(x, w)
    np.testing.assert_allclose(out[0], [5.0, 0.0])
    np.testing.assert_allclose(out[1], [2.0, 0.0])  # tautan tanpa data tidak menarik ke nol


def test_mlp_inputs_shape_and_missing():
    x = np.full((3, 10), np.nan, np.float32)
    x[:, 0] = 4.0
    idx = np.tile(np.arange(NEIGHBOURS), (5, 1))
    f = mlp_inputs(x, idx, np.ones((5, NEIGHBOURS)), np.zeros((3, 5)))
    assert f.shape == (15, 3 * NEIGHBOURS + 1)
    assert f[0, 0] == np.float32(np.log1p(4.0)) and f[0, 1] == 0      # hujan tetangga ke-2 hilang -> 0
    assert f[0, 2 * NEIGHBOURS] == 1 and f[0, 2 * NEIGHBOURS + 1] == 0  # topeng ada/tidak
