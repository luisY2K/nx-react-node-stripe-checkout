import express from 'express';
import Stripe from 'stripe';

import { config } from '../../config';
import { stripeEvents } from './StripeEvents';
import {
  checkoutSubscriptionSuccess,
  createCheckoutSession,
  createFreeTrialSubscription,
  createNoTrialSubscription,
  customerPortal,
  loadPrices,
  loadStripe,
  setupIntent,
} from './stripeServices';

const stripe = new Stripe(config.stripe.secret_key);

stripeEvents.init(stripe);

export const stripeRoute = express.Router();

stripeRoute.get('/load-stripe', loadStripe);

stripeRoute.get('/load-prices', loadPrices);

stripeRoute.post('/create-checkout-session', createCheckoutSession);

stripeRoute.post('/checkout-subscription-success', checkoutSubscriptionSuccess);

stripeRoute.post('/customer-portal', customerPortal);

stripeRoute.post('/create-no-trial-subscription', createNoTrialSubscription);

stripeRoute.post('/create-free-trial-subscription', createFreeTrialSubscription);

stripeRoute.post('/setup-intent', setupIntent);
