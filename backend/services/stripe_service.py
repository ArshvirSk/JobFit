"""Stripe service for checkout sessions and webhook handling."""
import logging
import stripe
from backend.config import settings

logger = logging.getLogger(__name__)


def _init_stripe():
    stripe.api_key = settings.stripe_secret_key


def get_price_id(plan_tier: str) -> str:
    """Map plan tier to Stripe Price ID."""
    mapping = {
        "pro": settings.stripe_price_pro_monthly,
        "annual_pro": settings.stripe_price_pro_annual,
    }
    price_id = mapping.get(plan_tier)
    if not price_id:
        raise ValueError(f"Unknown plan tier: {plan_tier}")
    return price_id


def create_checkout_session(
    user_id: str,
    user_email: str,
    plan_tier: str,
    success_url: str = "http://localhost:3000/billing?success=true",
    cancel_url: str = "http://localhost:3000/billing?canceled=true",
) -> str:
    """Create a Stripe Checkout Session and return the URL."""
    _init_stripe()

    price_id = get_price_id(plan_tier)

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        customer_email=user_email,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": user_id, "plan_tier": plan_tier},
    )

    return session.url


def verify_webhook(payload: bytes, sig_header: str) -> dict:
    """Verify a Stripe webhook signature and return the event."""
    _init_stripe()

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
        return event
    except stripe.error.SignatureVerificationError:
        logger.error("Stripe webhook signature verification failed")
        raise
    except Exception as e:
        logger.error(f"Stripe webhook error: {e}")
        raise
