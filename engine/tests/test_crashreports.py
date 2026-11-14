"""Engine error reports (crashreports.py): off without a DSN, and never the machine, the person or their words."""

import crashreports


class FakeSdk:
    def __init__(self):
        self.options = None

    def init(self, **options):
        self.options = options


def test_nothing_starts_without_a_dsn():
    sdk = FakeSdk()
    assert crashreports.init("1.0", environ={}, sdk=sdk) is False
    assert sdk.options is None


def test_a_bad_dsn_turns_reports_off_instead_of_failing():
    for bad in [
        "",
        "not a dsn",
        "http://k@o1.ingest.sentry.io/1",
        "https://o1.ingest.sentry.io/1",
        "https://k@host/abc",
    ]:
        assert crashreports.usable_dsn(bad) is None, bad


def test_with_a_dsn_it_starts_without_personal_data_or_local_variables():
    sdk = FakeSdk()
    started = crashreports.init(
        "3.17.0", environ={"SENTRY_DSN": "https://k@o1.ingest.de.sentry.io/42", "CREAVIA_LOCAL": "1"}, sdk=sdk
    )
    assert started is True
    o = sdk.options
    assert o["dsn"] == "https://k@o1.ingest.de.sentry.io/42"
    assert o["release"] == "creavia-engine@3.17.0"
    assert o["environment"] == "local"
    assert o["data_collection"]["user_info"] is False
    assert o["data_collection"]["stack_frame_variables"] is False
    assert o["data_collection"]["http_bodies"] == []
    assert o["server_name"] == ""


def test_events_lose_the_machine_the_person_and_their_home_folder():
    event = {
        "server_name": "colab-vm-123",
        "user": {"ip_address": "203.0.113.9"},
        "message": "failed on /home/ana/take.wav",
        "exception": {
            "values": [
                {
                    "value": "No such file: /home/ana/voices/script.txt",
                    "stacktrace": {
                        "frames": [{"abs_path": "/home/ana/creavia/gateway.py", "vars": {"script": "secret"}}]
                    },
                }
            ]
        },
    }
    out = crashreports.scrub_event(event, home="/home/ana")
    assert "server_name" not in out and "user" not in out
    assert out["message"] == "failed on ~/take.wav"
    exc = out["exception"]["values"][0]
    assert exc["value"] == "No such file: ~/voices/script.txt"
    assert exc["stacktrace"]["frames"][0] == {"abs_path": "~/creavia/gateway.py"}


def test_capture_is_silent_while_reports_are_off():
    crashreports._ACTIVE = False
    crashreports.capture(RuntimeError("boom"), "tts")  # must not raise or import anything


def test_a_cloud_worker_reports_without_a_consent_file():
    assert crashreports.consented({}) is True


def test_a_persons_computer_reports_only_while_their_settings_say_yes(tmp_path):
    settings = tmp_path / "settings.json"
    env = {"CREAVIA_LOCAL": "1", "CREAVIA_CONSENT_FILE": str(settings)}
    assert crashreports.consented(env) is False, "no settings file: no"
    settings.write_text('{"crash_reports": false}')
    assert crashreports.consented(env) is False
    settings.write_text('{"crash_reports": true}')
    assert crashreports.consented(env) is True
    settings.write_text("not json")
    assert crashreports.consented(env) is False, "unreadable: no"
    assert crashreports.consented({"CREAVIA_LOCAL": "1"}) is False, "no file named: no"


def test_without_consent_the_event_is_dropped(tmp_path):
    settings = tmp_path / "settings.json"
    settings.write_text('{"crash_reports": false}')
    env = {"CREAVIA_LOCAL": "1", "CREAVIA_CONSENT_FILE": str(settings)}
    assert crashreports._before_send({"message": "boom"}, {}, env) is None
    settings.write_text('{"crash_reports": true}')
    assert crashreports._before_send({"message": "boom"}, {}, env) == {"message": "boom"}


def test_log_entries_and_breadcrumbs_lose_paths_and_arguments():
    event = {
        "logentry": {"message": "can't read /home/ana/take.wav", "params": ["My script line"]},
        "breadcrumbs": {"values": [{"message": "loading /home/ana/voices"}]},
        "extra": {"script": "secret"},
    }
    out = crashreports.scrub_event(event, home="/home/ana")
    assert out == {"logentry": {"message": "can't read ~/take.wav"}}
