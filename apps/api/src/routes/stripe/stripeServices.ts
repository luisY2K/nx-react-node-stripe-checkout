import type { NextFunction, Request, Response } from 'express';
import Stripe from 'stripe';

import { config } from '../../config';
import { logger } from '../../lib';
import { stripeEvents } from './StripeEvents';

const stripe = new Stripe(config.stripe.secret_key);

stripeEvents.init(stripe);

export const loadStripe = (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    res.send({
      publishableKey: config.stripe.publishable_key,
    });
  } catch (error) {
    next(error);
  }
};

export const webhook = (
  req: Request & { rawBody: string },
  res: Response,
  next: NextFunction
) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      logger.info(event.type);
      break;
    case 'payment_intent.payment_failed':
      logger.info(event.type);
      break;
    case 'checkout.session.completed':
      logger.info(event.type);
      break;
    case 'invoice.paid':
      logger.info(event.type);
      break;
    case 'invoice.payment_failed':
      logger.info(event.type);
      break;
    case 'setup_intent.succeeded':
      logger.info(event.type);
      stripeEvents.setupIntentSucceeded(event.data?.object);
      break;
    case 'invoice.payment_succeeded':
      logger.info(event.type);
      try {
        stripeEvents.invoicePaymentSucceeded(event.data?.object);
      } catch (error) {
        next(error);
      }
      break;
    case 'customer.subscription.created':
      logger.info(event.type);
      try {
        stripeEvents.customerSubscriptionCreated(event.data?.object);
      } catch (error) {
        next(error);
      }
      break;
    default:
      // logger.debug(event.data?.object);
      logger.debug(`Unhandled event type ${event.type}`);
  }

  // Return a 200 respond to acknowledge receipt of the event
  res.send();
};

export const loadPrices = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { data: prices } = await stripe.prices.list({
      lookup_keys: config.stripe.lookup_keys,
      expand: ['data.product'],
    });

    if (!prices.length) logger.warn('[STRIPE] prices array is empty');

    res.send({ prices });
  } catch (error) {
    next(error);
  }
};

export const createCheckoutSession = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { price, email, userId } = req.body;

  try {
    if (!price || !userId)
      throw new Error('[STRIPE] prices and/or userId were undefined');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      customer_email: email,
      subscription_data: {
        metadata: { userId, email },
        trial_end: Math.round(Date.now() / 1000) + config.one_week * 2,
      },
      success_url: `${config.clientDomain}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.clientDomain}/checkout`,
    });

    res.redirect(303, session.url);
  } catch (error) {
    next(error);
  }
};

export const checkoutSubscriptionSuccess = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { sessionId } = req.body;
  try {
    const { customer } = await stripe.checkout.sessions.retrieve(sessionId);

    res.send({ customer });
  } catch (error) {
    next(error);
  }
};

export const customerPortal = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { customer } = req.body;
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${config.clientDomain}/customer/${customer}`,
    });

    res.redirect(303, portalSession.url);
  } catch (error) {
    next(error);
  }
};

export const createNoTrialSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { name, email, userId, priceId } = req.body;
  try {
    const customerExists = await stripe.customers.search({
      query: `email:"${email}"`,
    });

    if (customerExists.data?.length) {
      const [customer] = customerExists.data;

      const { data } = await stripe.paymentIntents.search({
        query: `customer:"${customer.id}"`,
      });

      const [paymentIntent] = data.length ? data : [null];

      if (paymentIntent.status === 'requires_payment_method') {
        // customer has a pending process
        // for example a card declined
        return res.send({
          clientSecret: paymentIntent.client_secret,
          customerId: customer.id,
        });
      }

      // customer already has a subscription
      return res.send({
        customerExist: customer.id,
      });
    }

    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        userId,
      },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { userId, email },
    });

    logger.debug('[SUBSCRIPTION]', subscription);

    const clientSecret = (
      (subscription.latest_invoice as any).payment_intent as Stripe.PaymentIntent
    ).client_secret;

    res.send({
      clientSecret,
      customerId: customer.id,
    });
  } catch (error) {
    next(error);
  }
};

export const createFreeTrialSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { userId, email, customerId, paymentMethod, priceId } = req.body;
  try {
    const subscription = await stripe.subscriptions.create({
      trial_period_days: 14,
      customer: customerId,
      default_payment_method: paymentMethod,
      items: [
        {
          price: priceId,
        },
      ],
      metadata: {
        userId,
        email,
      },
    });

    logger.debug('[SUBSCRIPTION]', subscription);

    res.send({ subscription });
  } catch (error) {
    next(error);
  }
};

export const setupIntent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { name, email, userId } = req.body;
  try {
    const customerExists = await stripe.customers.search({
      query: `email:"${email}"`,
    });

    if (customerExists.data?.length) {
      const [customer] = customerExists.data;

      const { data } = await stripe.setupIntents.list({
        customer: customer.id,
      });

      const [setupIntent] = data.length ? data : [null];

      if (setupIntent.status === 'requires_payment_method') {
        // customer has a pending process
        // for example a card declined
        return res.send({
          clientSecret: setupIntent.client_secret,
          customerId: customer.id,
        });
      }

      // customer already has a subscription
      return res.send({
        customerExist: customer.id,
      });
    }

    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        userId,
      },
    });

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: config.stripe.payment_method_types,
      metadata: { userId },
    });

    logger.debug('[SETUP_INTENT]', setupIntent);

    return res.send({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
    });
  } catch (error) {
    next(error);
  }
};
