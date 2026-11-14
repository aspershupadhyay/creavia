"""What the voice reads (lexicon.py): tech words spoken right, markdown and links read as words, [pause] markers
turned into gaps. The script itself is never changed, only the text handed to the engine."""

import pytest

from lexicon import is_devanagari, segments, speakable


@pytest.mark.parametrize(
    ("written", "spoken"),
    [
        ("Run SQL on 2 GPUs, e.g. via the API.", "Run sequel on 2 G P U's, for example via the A P I."),
        ("16GB of VRAM at 120fps, v2.1", "16 gigabytes of V R A M at 120 F P S, version 2.1"),
        ("C++ & C# -> .NET", "C plus plus and C sharp to dot net"),
        ("see https://www.example.com/a-b/", "see example dot com slash a b"),
        ("Say **hi** to [the docs](https://x.y) and `npm`", "Say hi to the docs and N P M"),
    ],
)
def test_speakable_reads_tech_text_aloud(written, spoken):
    assert speakable(written) == spoken


def test_capitalised_words_that_are_also_acronyms_stay_words():
    # the letter list is case-sensitive: "IT" and "US" written as words are not spelled out
    assert speakable("IT and US stay") == "IT and US stay"


def test_the_users_own_pronunciations_win():
    assert speakable("Ship SQL today", pronounce={"SQL": "S Q L"}) == "Ship S Q L today"


def test_tech_off_only_cleans_markdown():
    assert speakable("**SQL** stays", tech=False) == "SQL stays"


def test_other_languages_pass_through():
    hindi = "नमस्ते दुनिया"
    assert speakable(hindi) == hindi
    assert is_devanagari(hindi)
    assert not is_devanagari("hello")


def test_segments_split_at_pause_markers():
    assert segments("Ready? [pause 0.8] Let's go.") == [("Ready?", 0.8), ("Let's go.", None)]


def test_segments_default_gaps_add_up_and_are_capped():
    # [pause] 0.6 + [beat] 0.35 in a row add up; 800ms is 0.8 s; 99 s is capped at 5 s
    assert segments("a [pause] [beat] b [pause 800ms] c [pause 99]") == [("a", 0.95), ("b", 0.8), ("c", 5.0)]


def test_segments_without_markers_is_one_piece():
    assert segments("Just one line.") == [("Just one line.", None)]
    assert segments("   ") == []
