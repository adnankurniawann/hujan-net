import numpy as np
import pandas as pd

from hujannet_ml.calibrate import fit, itu, retrieve


def test_itu_matches_table_and_interpolates():
    k, a = itu(np.array([18.0, 18.0, 18.5]), np.array(["h", "v", "h"]))
    np.testing.assert_allclose(k[:2], [0.07078, 0.07708])
    np.testing.assert_allclose(a[:2], [1.0818, 1.0025])
    assert 0.07078 < k[2] < 0.08084


def rows_for(rain, waa, k_scale, wet):
    """Baris sintetis yang redamannya dibangkitkan dari hujan dengan WAA dan c tertentu."""
    k, alpha, length = 0.1, 1.0, 5.0
    return pd.DataFrame({"dip": k_scale * k * rain ** alpha * length + waa * (rain > 0), "wet": wet,
                         "length_km": length, "k": k, "alpha": alpha, "oracle": rain})


def test_retrieve_inverts_and_respects_dry_flag():
    rain = np.array([0.0, 2.0, 10.0])
    rows = rows_for(rain, 1.0, 2.0, np.array([False, True, False]))
    np.testing.assert_allclose(retrieve(rows, 1.0, 2.0), [0.0, 2.0, 0.0], rtol=1e-5)


def test_fit_recovers_known_parameters():
    rain = np.random.default_rng(0).gamma(0.8, 4.0, 2000)
    p = fit(rows_for(rain, 1.0, 2.0, np.ones(2000, bool)))
    assert p["waa_db"] == 1.0 and abs(p["k_scale"] - 2.0) < 1e-3
