import asyncio
from types import SimpleNamespace

import apify_client

import app.routes.candidates as candidates_route


SEARCH_ITEMS = [
    {"resultType": "profile", "profileUrl": "https://www.linkedin.com/in/jane-doe", "fullName": "Jane Doe"},
    {"resultType": "profile", "profileUrl": "https://www.linkedin.com/in/bad-row", "errorType": "PROFILE_UNAVAILABLE", "errorMessage": "not found"},
    {"resultType": "profile", "profileUrl": "https://www.linkedin.com/in/john-roe", "fullName": "John Roe"},
]


class FakeActor:
    def __init__(self, client, actor_id):
        self.client = client
        self.actor_id = actor_id

    def call(self, run_input=None, **_kwargs):
        self.client.calls.append((self.actor_id, run_input))
        # apify-client 3 returns run models, not dicts
        return SimpleNamespace(status="SUCCEEDED", default_dataset_id=f"ds-{len(self.client.calls)}")


class FakeDataset:
    def __init__(self, dataset_id):
        self.dataset_id = dataset_id

    def iterate_items(self):
        # first run is the search, the profile scrape returns nothing so no candidates are staged
        return iter(SEARCH_ITEMS if self.dataset_id == "ds-1" else [])


class FakeApifyClient:
    instances = []

    def __init__(self, token):
        self.calls = []
        FakeApifyClient.instances.append(self)

    def actor(self, actor_id):
        return FakeActor(self, actor_id)

    def dataset(self, dataset_id):
        return FakeDataset(dataset_id)


async def _drain(response):
    return [chunk async for chunk in response.body_iterator]


def test_auto_source_uses_working_search_actor(monkeypatch):
    FakeApifyClient.instances = []
    db = {"positions": {"1": {"title": "Backend Engineer", "boolean_queries": '("Backend Engineer") AND ("Python")'}}}
    monkeypatch.setattr(apify_client, "ApifyClient", FakeApifyClient)
    monkeypatch.setattr(candidates_route, "load_db", lambda: db)
    monkeypatch.setattr(candidates_route, "save_db", lambda _db: None)
    monkeypatch.setattr(candidates_route, "get_bias_controls", lambda _db: {})
    monkeypatch.setattr(candidates_route.settings, "APIFY_API_TOKEN", "apify-token")
    monkeypatch.setattr(candidates_route.settings, "LINKEDIN_LI_AT_COOKIE", "")

    response = candidates_route.auto_source_candidates(candidates_route.AutoSourcePayload(position_id=1, count=5))
    events = "".join(asyncio.run(_drain(response)))

    assert "ERROR" not in events
    search_call, profile_call = FakeApifyClient.instances[0].calls
    assert search_call[0] == "johnvc/linkedin-people-search-api"
    assert search_call[1]["keywords"] == '("Backend Engineer") AND ("Python")'
    assert search_call[1]["maxResults"] == 5
    assert profile_call[1]["profileUrls"] == [
        "https://www.linkedin.com/in/jane-doe",
        "https://www.linkedin.com/in/john-roe",
    ]
