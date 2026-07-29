/**
 * Tourist FAQ copy for /faq static generation + FAQPage JSON-LD.
 * Keep in sync with touristFAQ in src/components/HelpCenter.tsx.
 */
export const BASE_PRICE_AUD = 15;
export const GUEST_FEE_AUD = 10;
export const EXTEND_FEE_AUD = 15;
export const MAX_PARTY_SIZE = 20;

const passProductSummary = `StikmNek Pass (AUD): $${BASE_PRICE_AUD} first person (ages 6+), then $${GUEST_FEE_AUD} each for every additional guest up to ${MAX_PARTY_SIZE} per pass; choose the 7-day holiday pass (+$${EXTEND_FEE_AUD} for the holiday period) or a 24-hour day pass`;

export const TOURIST_FAQ = [
  {
    question: 'What is StikmNek?',
    answer: `StikmNek is a tourist discount platform for Vanuatu. You buy a digital pass (prices in Australian dollars), then show your pass QR code at partner restaurants, tours, activities, spas, and accommodation. Current pass types: ${passProductSummary}.`,
  },
  {
    question: 'How do I purchase a pass?',
    answer: `Open Passes in the top menu, set your group and 24-hour or 7-day holiday duration (${passProductSummary}), pick a start date, and complete payment (card or PayPal where enabled). Your pass coverage follows the dates shown at checkout. Prices are in AUD.`,
  },
  {
    question: 'How do I redeem a deal?',
    answer:
      'Visit a partner business while your pass is valid, open your pass QR code in the app, and staff scan it with their StikmNek scanner. The savings shown for that listing are applied as part of the redemption.',
  },
  {
    question: 'Can I use my pass at multiple businesses?',
    answer:
      'Yes. You can visit different partner businesses while your pass is active, and you may return to the same venue more than once on the same day (for example breakfast and later happy hour) as long as your pass is valid and each redemption is recorded by staff when you use the deal.',
  },
  {
    question: 'What if a business is closed?',
    answer:
      'Check the hours on the deal card and business detail page. Use Map to browse by area; when you allow location, the map can help with distance.',
  },
  {
    question: 'Can I get a refund?',
    answer:
      'Passes are non-refundable once activated or as set out in our terms. If something went wrong with payment or access, email support and we will help where we can.',
  },
  {
    question: 'How do I leave a review?',
    answer:
      'Open the business from Deals or Map, go to the reviews section. You can submit a review within 30 days of a StikmNek redemption at that business (the app checks this). Rate 1–5 stars and add a short comment.',
  },
  {
    question: 'Is my payment secure?',
    answer:
      "Yes. Checkout runs through PayPal's secure flow. We do not store your card number on StikmNek servers.",
  },
  {
    question: 'Can I use StikmNek offline?',
    answer:
      'You need the internet to buy a pass and browse deals. For redemption, keep your phone charged; a screenshot of your QR can help if signal is weak, but the latest pass screen in the app is best.',
  },
  {
    question: 'How do I find deals near me?',
    answer:
      'Use Map and allow location if you want to centre the map on you and filter by distance. You can also browse Deals by category and favourites without turning location on.',
  },
  {
    question: 'How does the StikmNek Pass work?',
    answer: `Buy a digital pass online, then show your QR code at partner venues across Vanuatu to unlock listed discounts. ${passProductSummary}.`,
  },
  {
    question: 'Where can I use it?',
    answer:
      'At StikmNek partner businesses in Vanuatu — dining, tours, activities, spa & wellness, shopping, transportation, and accommodation listed on Deals and Map.',
  },
  {
    question: 'How much does it cost?',
    answer: passProductSummary + '. Prices are in Australian dollars (AUD).',
  },
];
