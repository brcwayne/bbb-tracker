import datetime as dt
import pytest
from bbb_migration import normalize as n


@pytest.mark.parametrize("v,expected", [
    ("#VALUE!", True), ("#REF!", True), ("#N/A", True), ("#DIV/0!", True),
    ("normal", False), ("", False), (None, False), (12.3, False),
])
def test_is_error_value(v, expected):
    assert n.is_error_value(v) is expected


@pytest.mark.parametrize("v,expected", [
    (1234.56, 1234.56),
    (1234, 1234.0),
    ("1.234,56", 1234.56),
    ("1,234.56", 1234.56),
    ("1234,5", 1234.5),
    ("1234.5", 1234.5),
    ("  7,19 ", 7.19),
    ("1.000.000,00", 1000000.0),
    ("#VALUE!", None),
    ("", None),
    (None, None),
])
def test_parse_decimal(v, expected):
    assert n.parse_decimal(v) == expected


@pytest.mark.parametrize("v,expected", [
    (dt.datetime(2020, 1, 6), "2020-01-06"),
    (dt.date(2020, 1, 6), "2020-01-06"),
    ("2020-01-06", "2020-01-06"),
    ("06.01.2020", "2020-01-06"),
    ("6/1/2020", "2020-01-06"),
    (43836, "2020-01-06"),          # Excel serial for 2020-01-06
    ("", None),
    ("#REF!", None),
    (None, None),
])
def test_parse_date(v, expected):
    assert n.parse_date(v) == expected


@pytest.mark.parametrize("v,expected", [
    ("BUY", "AL"), ("buy", "AL"), (" AL ", "AL"), ("Alış", "AL"),
    ("SELL", "SAT"), ("sat", "SAT"), ("Satış", "SAT"),
    ("", None), (None, None), ("HOLD", None),
])
def test_parse_action(v, expected):
    assert n.parse_action(v) == expected
