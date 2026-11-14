"""How well a take matches its script (quality.py score_text): the number that decides whether a line is voiced again."""

from quality import score_text


def test_a_perfect_take_scores_one():
    assert score_text("the cat sat on the mat", "the cat sat on the mat") == {"score": 1.0, "missed": [], "added": []}


def test_wrong_words_lower_the_score_and_are_named():
    result = score_text("the cat sat on the mat", "the dog sat on a mat")
    assert result["score"] < 0.8
    assert "cat" in result["missed"]
    assert "dog" in result["added"]


def test_punctuation_and_case_do_not_count_against_a_take():
    assert score_text("Hello, world!", "hello world")["score"] == 1.0
