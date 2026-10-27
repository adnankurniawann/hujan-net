import numpy as np
import pandas as pd
import torch

from hujannet_ml.cnn import WINDOW, Net, sequences, split_labels


def test_sequences_end_before_label_time():
    n_min = WINDOW + 10
    dip = np.arange(n_min * 2, dtype=np.float32).reshape(n_min, 2) / 100  # nilai unik per (menit, sub-link)
    dip[WINDOW + 3, 1] = np.nan

    x = sequences(dip, pos=np.array([WINDOW, WINDOW + 5]), link=np.array([0, 1]))
    assert x.shape == (2, 2, WINDOW)
    np.testing.assert_allclose(x[0, 0] * 5, dip[:WINDOW, 0], rtol=1e-6)        # menit 0..WINDOW-1, bukan WINDOW
    np.testing.assert_allclose(x[1, 0, -1] * 5, dip[WINDOW + 4, 1], rtol=1e-6)
    assert x[1, 1, -2] == 0 and x[1, 0, -2] == 0                              # menit hilang: nilai 0, topeng 0
    assert x[0, 1].all()


def test_sequences_clip():
    dip = np.full((WINDOW + 1, 1), 100.0, np.float32)
    assert sequences(dip, np.array([WINDOW]), np.array([0]))[0, 0].max() == 8.0  # 40 dB / 5


def test_net_shapes():
    out = Net()(torch.zeros(3, 2, WINDOW), torch.zeros(3, 2))
    assert out.shape == (3,)


def test_split_labels():
    t = pd.Series(pd.to_datetime(["2021-10-31T23:45", "2021-11-01T00:00", "2022-06-01T00:00", "2023-01-01T00:00"]))
    assert list(split_labels("openrainer", t)) == ["train", "val", "test", ""]
