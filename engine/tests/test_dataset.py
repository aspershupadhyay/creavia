"""Training clips from long recordings (dataset.py): where clips are cut, and which are dropped and why."""

from dataset import MAX_S, MIN_S, explain, keep, level_gain, segment


def words_from(text, start=0.0, per_word=0.4, gap=0.05):
    """Whisper-style words [{w, s, e}] read at an even pace."""
    out, t = [], start
    for w in text.split():
        out.append({"w": w, "s": round(t, 3), "e": round(t + per_word, 3)})
        t += per_word + gap
    return out


def test_every_clip_is_within_the_length_limits():
    words = words_from(" ".join(["We talk about voices and models today."] * 30))
    clips = segment(words, words[-1]["e"] + 1)
    assert clips
    for start, end, _text in clips:
        assert MIN_S <= end - start <= MAX_S + 0.5


def test_clips_end_at_a_sentence_end_when_they_can():
    words = words_from(" ".join(["This sentence is about five seconds long, give or take a word."] * 6))
    clips = segment(words, words[-1]["e"] + 1)
    assert all(text.endswith(".") for _s, _e, text in clips[:-1])


def test_a_long_silence_always_cuts():
    first = words_from("one two three four five six", start=0.0)
    second = words_from("seven eight nine ten eleven twelve", start=first[-1]["e"] + 2.0)
    clips = segment(first + second, second[-1]["e"] + 1)
    assert [text for _s, _e, text in clips] == ["one two three four five six", "seven eight nine ten eleven twelve"]


def test_padding_never_reaches_into_a_neighbours_words():
    # clips are padded into the silence around them (two neighbours may share that silence), never over a word
    words = words_from(" ".join(["Short line here."] * 40))
    clips = segment(words, words[-1]["e"] + 1)
    for start, end, text in clips:
        touched = [w for w in words if w["e"] > start and w["s"] < end]
        assert len(touched) == len(text.split())


CLEAN = {"clipped": 0.0, "snr_db": 40.0, "reverb_s": 0.2, "bandwidth_hz": 10000}


def test_keep_takes_a_clean_clip():
    assert keep("A clean clip of about the right speed.", 3.0, CLEAN) is None


def test_keep_says_why_a_clip_is_dropped():
    text = "A clean clip of about the right speed."
    assert keep(text, 1.0, CLEAN) == "short"
    assert keep(text, MAX_S + 2, CLEAN) == "long"
    assert keep("... !!!", 3.0, CLEAN) == "no words"
    assert keep("Hi.", 3.0, CLEAN) == "timing"
    assert keep(text, 3.0, {**CLEAN, "clipped": 0.01}) == "clipped"
    assert keep(text, 3.0, {**CLEAN, "snr_db": 10.0}) == "noisy"
    assert keep(text, 3.0, {**CLEAN, "reverb_s": 1.0}) == "echo"
    assert keep(text, 3.0, {**CLEAN, "bandwidth_hz": 3000}) == "muffled"


def test_level_gain_is_bounded():
    assert level_gain({"level_db": None}, 0.5) == 1.0
    assert level_gain({"level_db": -20.0}, 0.0) == 1.0
    # far too quiet: capped at +15 dB, and never past -1 dBFS at the peak
    assert level_gain({"level_db": -60.0}, 0.01) == 10 ** (15 / 20)
    assert level_gain({"level_db": -60.0}, 0.5) == 10 ** (-1 / 20) / 0.5


def test_explain_lists_the_biggest_reason_first():
    assert explain({"echo": 3, "noisy": 12}) == "12 background noise, 3 room echo"
