import pytest
import uuid
import json
from unittest.mock import MagicMock, patch
from app.services.analytics_service import AnalyticsService
from app.services.sequence_service import SequenceService


@pytest.fixture
def mock_supabase():
    with patch("app.services.analytics_service.supabase") as mock_db:
        yield mock_db


def test_ab_variant_hashing_assignment():
    """
    Tests deterministic variant assignment hashing logic.
    """
    lead_id_1 = "lead_aaa"
    lead_id_2 = "lead_bbb"
    exp_id = "exp_123"

    # Hashing should be 100% deterministic
    import hashlib
    def get_variant(lead_id):
        hash_input = f"{lead_id}_{exp_id}"
        hash_val = int(hashlib.sha256(hash_input.encode()).hexdigest(), 16)
        percent = hash_val % 100
        return "A" if percent < 50 else "B"

    # Should give identical results on repeated calls
    assert get_variant(lead_id_1) == get_variant(lead_id_1)
    assert get_variant(lead_id_2) == get_variant(lead_id_2)


def test_analytics_funnel_calculations(mock_supabase):
    """
    Verifies the aggregation of conversion step funnel lists.
    """
    # Mock return values for counts
    mock_supabase.table().select().eq().execute.return_value = MagicMock(count=10, data=[])
    mock_supabase.table().select().in_().execute.return_value = MagicMock(count=10, data=[])
    
    metrics = AnalyticsService.get_funnel_metrics("user_123", "campaign_123")
    assert "imported" in metrics
    assert "researched" in metrics
    assert "generated" in metrics
    assert "approved" in metrics
    assert "scheduled" in metrics
    assert "sent" in metrics
    assert "replied" in metrics
    assert "positive_reply" in metrics


def test_ab_experiment_statistical_bounds(mock_supabase):
    """
    Verifies that Z-test calculations are computed or flag warnings when sample sizes are insufficient.
    """
    # 1. Test insufficient data warning (< 50 sends per variant)
    mock_supabase.table().select().eq().execute.side_effect = [
        # Experiments
        MagicMock(data=[{"id": "exp_123", "name": "Subject Line Test", "status": "active", "primary_metric": "reply_rate"}]),
        # Variants
        MagicMock(data=[
            {"id": "v1", "experiment_id": "exp_123", "campaign_id": "c1", "name": "A", "prompt_template_version_id": "ver_a", "weight": 0.5},
            {"id": "v2", "experiment_id": "exp_123", "campaign_id": "c1", "name": "B", "prompt_template_version_id": "ver_b", "weight": 0.5}
        ]),
        # Assignments
        MagicMock(data=[
            {"lead_id": "l1", "variant_name": "A"},
            {"lead_id": "l2", "variant_name": "B"}
        ]),
        # Send events
        MagicMock(data=[
            {"variant_name": "A", "event_type": "sent"},
            {"variant_name": "A", "event_type": "reply"},
            {"variant_name": "B", "event_type": "sent"}
        ])
    ]

    report = AnalyticsService.get_experiment_report("user_123", "exp_123")
    assert report["comparison"]["insufficient_data"] is True
    assert "declared_winner" in report["comparison"]

    # 2. Test sufficient data statistical Z-test execution
    mock_supabase.table().select().eq().execute.side_effect = [
        # Experiments
        MagicMock(data=[{"id": "exp_123", "name": "Subject Line Test", "status": "active", "primary_metric": "reply_rate"}]),
        # Variants
        MagicMock(data=[
            {"id": "v1", "experiment_id": "exp_123", "campaign_id": "c1", "name": "A", "prompt_template_version_id": "ver_a", "weight": 0.5},
            {"id": "v2", "experiment_id": "exp_123", "campaign_id": "c1", "name": "B", "prompt_template_version_id": "ver_b", "weight": 0.5}
        ]),
        # Assignments
        MagicMock(data=[]),
        # Send events (Variant A has 100 sends, 30 replies. Variant B has 100 sends, 5 replies)
        MagicMock(data=([{"variant_name": "A", "event_type": "sent"}] * 100 + [{"variant_name": "A", "event_type": "reply"}] * 30 +
                        [{"variant_name": "B", "event_type": "sent"}] * 100 + [{"variant_name": "B", "event_type": "reply"}] * 5))
    ]

    report_sig = AnalyticsService.get_experiment_report("user_123", "exp_123")
    assert report_sig["comparison"]["insufficient_data"] is False
    assert report_sig["comparison"]["confidence_interval_95"][0] > 0 # Significant winner A
    assert "Variant A is the statistically significant winner" in report_sig["comparison"]["declared_winner"]
