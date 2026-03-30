import React, { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import {
  HelpCircle, Book, Store, Shield, Users, ChevronDown, ChevronRight,
  Search, ArrowLeft, MapPin, CreditCard, QrCode, Star, Camera,
  BarChart3, Mail, Phone, MessageSquare, Ticket, Globe, Clock,
  CheckCircle, AlertCircle, Lightbulb, Zap, FileText, ExternalLink
} from 'lucide-react';

type HelpSection = 'overview' | 'tourist-faq' | 'business-guide' | 'admin-manual' | 'quick-start' | 'troubleshooting';

interface FAQItem {
  question: string;
  answer: string;
  icon?: React.ReactNode;
}

const HelpCenter: React.FC = () => {
  const { language, setCurrentView, user } = useAppContext();
  const [activeSection, setActiveSection] = useState<HelpSection>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

  const sections: { key: HelpSection; label: string; icon: React.ReactNode; description: string }[] = [
    { key: 'overview', label: 'Getting Started', icon: <Zap className="w-5 h-5" />, description: 'Learn the basics of StikmNek' },
    { key: 'tourist-faq', label: 'Tourist FAQ', icon: <Users className="w-5 h-5" />, description: 'Common questions from travelers' },
    { key: 'business-guide', label: 'Business Owner Guide', icon: <Store className="w-5 h-5" />, description: 'Complete guide for business owners' },
    { key: 'admin-manual', label: 'Admin Operations', icon: <Shield className="w-5 h-5" />, description: 'Admin panel operations manual' },
    { key: 'quick-start', label: 'Quick Start Guide', icon: <Lightbulb className="w-5 h-5" />, description: 'For new beta businesses' },
    { key: 'troubleshooting', label: 'Troubleshooting', icon: <AlertCircle className="w-5 h-5" />, description: 'Fix common issues' },
  ];

  const touristFAQ: FAQItem[] = [
    { question: 'What is StikmNek?', answer: 'StikmNek is a tourist discount platform for Vanuatu. Purchase a pass (Daily, Weekly, or Monthly) and unlock exclusive deals at restaurants, tours, activities, spas, and accommodation across all locations in Vanuatu.', icon: <HelpCircle className="w-4 h-4" /> },

    { question: 'How do I purchase a pass?', answer: 'Navigate to the "Passes" section, choose your preferred pass (Family Explorer $15, Extended Group Adventure $45, or Ultimate Crew Experience $99), select your start date, and complete payment via PayPal. Your pass activates on the selected date.', icon: <CreditCard className="w-4 h-4" /> },

    { question: 'How do I redeem a deal?', answer: 'Visit any partner business, show your digital pass QR code on your phone, and the business will scan it to verify your pass. The discount is applied immediately to your purchase.', icon: <QrCode className="w-4 h-4" /> },
    { question: 'Can I use my pass at multiple businesses?', answer: 'Yes! Your pass works at ALL partner businesses during its validity period. There is no limit on how many deals you can redeem per day.', icon: <Store className="w-4 h-4" /> },
    { question: 'What if a business is closed?', answer: 'Check the business hours listed on each deal card. You can also use the Map view to see which businesses are near you and their operating hours.', icon: <Clock className="w-4 h-4" /> },
    { question: 'Can I get a refund?', answer: 'Passes are non-refundable once activated. However, if you experience issues, please contact our support team and we will work to resolve the situation.', icon: <CreditCard className="w-4 h-4" /> },
    { question: 'How do I leave a review?', answer: 'After visiting a business, go to the business detail page and scroll to the reviews section. You can rate from 1-5 stars and leave a comment about your experience.', icon: <Star className="w-4 h-4" /> },
    { question: 'Is my payment secure?', answer: 'Yes. All payments are processed through PayPal\'s secure payment system. We never store your credit card details on our servers.', icon: <Shield className="w-4 h-4" /> },
    { question: 'Can I use StikmNek offline?', answer: 'You need an internet connection to purchase passes and view deals. However, your QR code can be screenshotted for offline use at businesses.', icon: <Globe className="w-4 h-4" /> },
    { question: 'How do I find deals near me?', answer: 'Enable location services and use the Map view to see deals sorted by distance. You can also enable proximity alerts to get notified when you are near a partner business.', icon: <MapPin className="w-4 h-4" /> },
  ];

  const businessGuide: { title: string; content: string; steps?: string[] }[] = [
    {
      title: '1. Creating Your Account',
      content: 'Sign up for a StikmNek business account to get started.',
      steps: [
        'Click "Sign In" in the top navigation bar',
        'Select "Sign Up" and choose "Business" as your account type',
        'Enter your name, email, and create a password',
        'Verify your email address via the confirmation link',
      ],
    },
    {
      title: '2. Submitting Your Business Listing',
      content: 'Submit your business for review by our admin team.',
      steps: [
        'Go to "My Business" in the navigation menu',
        'Click "New Listing" in the sidebar',
        'Fill in all required fields: business name, category, description, and discount offer',
        'Upload high-quality photos of your business (first photo becomes the main image)',
        'Set your original price and discounted price',
        'Add your location, phone number, and operating hours',
        'Click "Submit for Approval" - your listing will be reviewed within 24 hours',
      ],
    },
    {
      title: '3. Managing Your Listing',
      content: 'Once approved, manage your listing from the Business Dashboard.',
      steps: [
        'Overview tab: See key metrics, recent activity, and quick actions',
        'Edit Listing tab: Update description, hours, phone, pricing, and discount offers',
        'All edits are submitted for admin review before going live',
        'Photos tab: Upload, delete, and set main photos for your gallery',
        'Reviews tab: Read customer reviews and post responses',
      ],
    },
    {
      title: '4. Understanding Analytics',
      content: 'Track your business performance with detailed analytics.',
      steps: [
        'View total redemptions, revenue generated, and customer engagement',
        'See weekly trends and peak days for redemptions',
        'Monitor your average rating and review sentiment',
        'Track how many tourists have viewed your listing',
      ],
    },
    {
      title: '5. Responding to Reviews',
      content: 'Engage with customers by responding to their reviews.',
      steps: [
        'Go to the Reviews tab in your dashboard',
        'Read each review and its star rating',
        'Type a professional response in the reply field',
        'Click "Reply" to post your response publicly',
        'Tip: Respond to both positive and negative reviews to show you care',
      ],
    },
    {
      title: '6. Email Notifications',
      content: 'Stay informed with email notifications.',
      steps: [
        'Receive email when your listing is approved or needs changes',
        'Get notified when customers leave new reviews',
        'Manage your email preferences in the Emails tab',
        'View sent email history and resend if needed',
      ],
    },
  ];

  const adminManual: { title: string; content: string; steps?: string[] }[] = [
    {
      title: 'Accessing the Admin Panel',
      content: 'The admin panel is accessible to users with admin privileges. Navigate to the Admin section from the main navigation.',
    },
    {
      title: 'Reviewing Business Submissions',
      content: 'New business submissions appear in the Pending tab.',
      steps: [
        'Review the business details, photos, and discount offer',
        'Check for completeness and accuracy of information',
        'Approve listings that meet quality standards',
        'Reject with clear notes explaining what needs improvement',
        'Approved businesses go live immediately on the platform',
      ],
    },
    {
      title: 'Managing Edit Requests',
      content: 'Business owners can submit edit requests for their listings.',
      steps: [
        'Review pending edits in the Edits tab',
        'Compare proposed changes with current listing data',
        'Approve changes that are accurate and appropriate',
        'Reject with notes if changes need revision',
      ],
    },
    {
      title: 'Photo Moderation',
      content: 'Review uploaded photos for quality and appropriateness.',
      steps: [
        'Check the Photos tab for pending photo reviews',
        'Ensure photos are high quality and relevant to the business',
        'Remove any inappropriate or low-quality images',
        'Set featured photos for highlighted listings',
      ],
    },
    {
      title: 'Monitoring System Health',
      content: 'Keep the platform running smoothly.',
      steps: [
        'Check error logs regularly for recurring issues',
        'Monitor support tickets and respond promptly',
        'Review feedback submissions from users',
        'Track email delivery rates and fix any failures',
      ],
    },
  ];

  const troubleshooting: FAQItem[] = [
    { question: 'My QR code is not scanning', answer: 'Ensure your screen brightness is at maximum. Try zooming in on the QR code. If the issue persists, take a screenshot and show it to the business. You can also try refreshing the page to regenerate the QR code.' },
    { question: 'Payment failed or was declined', answer: 'Check your PayPal account has sufficient funds. Ensure your PayPal account is verified. Try a different payment method within PayPal. If the issue persists, contact PayPal support or try again later.' },
    { question: 'I cannot see my purchased pass', answer: 'Go to your Dashboard and check the "My Pass" section. If your pass does not appear, try signing out and signing back in. Ensure the pass start date has arrived - passes activate on the selected date.' },
    { question: 'Business listing not appearing after approval', answer: 'It may take a few minutes for the listing to appear. Try refreshing the page. If it still does not show, check the Business Dashboard to confirm the approval status.' },
    { question: 'Cannot upload photos', answer: 'Ensure your photos are in PNG or JPG format and under 5MB each. Check your internet connection. Try a different browser if the issue persists.' },
    { question: 'Location services not working', answer: 'Enable location permissions in your browser settings. On mobile, ensure GPS is turned on. Try refreshing the page after enabling location services.' },
    { question: 'Email notifications not arriving', answer: 'Check your spam/junk folder. Ensure your email address is correct in your profile. Check your email preferences in the dashboard to ensure notifications are enabled.' },
    { question: 'Page is loading slowly', answer: 'Check your internet connection. Try clearing your browser cache. Disable browser extensions that might interfere. Try using a different browser.' },
  ];

  const filteredTouristFAQ = touristFAQ.filter(item =>
    !searchQuery || item.question.toLowerCase().includes(searchQuery.toLowerCase()) || item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTroubleshooting = troubleshooting.filter(item =>
    !searchQuery || item.question.toLowerCase().includes(searchQuery.toLowerCase()) || item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderFAQList = (items: FAQItem[]) => (
    <div className="space-y-3">
      {items.map((item, idx) => {
        const key = `${activeSection}-${idx}`;
        const isExpanded = expandedFAQ === key;
        return (
          <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-teal-200 transition-colors">
            <button
              onClick={() => setExpandedFAQ(isExpanded ? null : key)}
              className="w-full flex items-center gap-3 p-4 text-left"
              aria-expanded={isExpanded}
            >
              {item.icon && <span className="text-teal-500 flex-shrink-0">{item.icon}</span>}
              <span className="flex-1 text-sm font-semibold text-gray-900">{item.question}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 pt-0">
                <div className="pl-7 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                  {item.answer}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No results found for "{searchQuery}"</p>
        </div>
      )}
    </div>
  );

  const renderGuide = (items: { title: string; content: string; steps?: string[] }[]) => (
    <div className="space-y-6">
      {items.map((item, idx) => (
        <div key={idx} className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-bold text-gray-900 mb-2">{item.title}</h3>
          <p className="text-sm text-gray-600 mb-4">{item.content}</p>
          {item.steps && (
            <ol className="space-y-2.5">
              {item.steps.map((step, sIdx) => (
                <li key={sIdx} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-50 text-teal-700 text-xs font-bold flex items-center justify-center mt-0.5">
                    {sIdx + 1}
                  </span>
                  <span className="text-sm text-gray-700 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      {/* Header */}
      <div className="bg-gradient-to-br from-teal-600 via-emerald-600 to-teal-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <button
            onClick={() => setCurrentView('home')}
            className="flex items-center gap-2 text-white/70 hover:text-white text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Book className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Help Center</h1>
              <p className="text-white/70 text-sm">Everything you need to know about StikmNek</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-xl mt-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help articles..."
              className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 text-white placeholder-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <div className="lg:w-64 flex-shrink-0">
            <nav className="space-y-1 lg:sticky lg:top-24">
              {sections.map(section => (
                <button
                  key={section.key}
                  onClick={() => { setActiveSection(section.key); setExpandedFAQ(null); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                    activeSection === section.key
                      ? 'bg-teal-50 text-teal-700 font-semibold border border-teal-200'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className={activeSection === section.key ? 'text-teal-600' : 'text-gray-400'}>{section.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{section.label}</p>
                  </div>
                </button>
              ))}
            </nav>

            {/* Contact Card */}
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-bold text-gray-900 mb-3">Need More Help?</h4>
              <div className="space-y-2.5 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-teal-500" />
                  <span>stikmnek@gmail.com</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-teal-500" />
                  <span>+678 12345</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-teal-500" />
                  <span>Use the feedback button</span>
                </div>
              </div>
              <button
                onClick={() => setCurrentView('support' as any)}
                className="w-full mt-4 py-2.5 rounded-xl bg-teal-50 text-teal-700 text-sm font-semibold hover:bg-teal-100 transition-colors"
              >
                Open Support Ticket
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Overview */}
            {activeSection === 'overview' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Welcome to StikmNek</h2>
                  <p className="text-gray-600 text-sm leading-relaxed mb-6">
                    StikmNek is Vanuatu's premier tourist discount platform. Whether you're a traveler looking for the best deals
                    or a business owner wanting to attract more customers, we've got you covered.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { icon: <Ticket className="w-6 h-6" />, title: 'For Tourists', desc: 'Buy a pass and save up to 35% at partner businesses', color: 'bg-blue-50 text-blue-600' },
                      { icon: <Store className="w-6 h-6" />, title: 'For Businesses', desc: 'List your business and reach thousands of tourists', color: 'bg-emerald-50 text-emerald-600' },
                      { icon: <Shield className="w-6 h-6" />, title: 'For Admins', desc: 'Manage listings, reviews, and platform operations', color: 'bg-purple-50 text-purple-600' },
                    ].map((card, i) => (
                      <div key={i} className="p-5 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                        <div className={`w-12 h-12 rounded-xl ${card.color} flex items-center justify-center mb-3`}>
                          {card.icon}
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 mb-1">{card.title}</h3>
                        <p className="text-xs text-gray-500">{card.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">How It Works</h3>
                  <div className="space-y-4">
                    {[
                      { step: '1', title: 'Create an Account', desc: 'Sign up as a tourist or business owner' },
                      { step: '2', title: 'Choose Your Pass', desc: 'Select Daily ($15), Weekly ($45), or Monthly ($99)' },
                      { step: '3', title: 'Browse Deals', desc: 'Explore dining, tours, activities, spa, and more' },
                      { step: '4', title: 'Show Your QR Code', desc: 'Present your digital pass at any partner business' },
                      { step: '5', title: 'Save Money', desc: 'Enjoy instant discounts of up to 35% off' },

                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {item.step}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">{item.title}</h4>
                          <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tourist FAQ */}
            {activeSection === 'tourist-faq' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Tourist FAQ</h2>
                <p className="text-sm text-gray-500 mb-6">Frequently asked questions from travelers visiting Vanuatu</p>
                {renderFAQList(filteredTouristFAQ)}
              </div>
            )}

            {/* Business Guide */}
            {activeSection === 'business-guide' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Business Owner Guide</h2>
                <p className="text-sm text-gray-500 mb-6">Complete guide to listing and managing your business on StikmNek</p>
                {renderGuide(businessGuide)}
              </div>
            )}

            {/* Admin Manual */}
            {activeSection === 'admin-manual' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Admin Operations Manual</h2>
                <p className="text-sm text-gray-500 mb-6">Guide for platform administrators</p>
                {renderGuide(adminManual)}
              </div>
            )}

            {/* Quick Start */}
            {activeSection === 'quick-start' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl border border-teal-200 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Zap className="w-6 h-6 text-teal-600" />
                    <h2 className="text-xl font-bold text-gray-900">Quick Start Guide for Beta Businesses</h2>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Welcome to the StikmNek beta program! Follow these steps to get your business listed and start attracting tourists.
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Step-by-Step Setup (15 minutes)</h3>
                  <div className="space-y-6">
                    {[
                      {
                        step: 1,
                        title: 'Sign Up for a Business Account',
                        time: '2 min',
                        details: 'Visit stikm.nek and click "Sign In" then "Sign Up". Choose "Business" as your account type. Use your business email for verification.',
                      },
                      {
                        step: 2,
                        title: 'Prepare Your Business Information',
                        time: '3 min',
                        details: 'Gather: business name, category (dining/tours/activities/shopping/spa/accommodation), a compelling description (2-3 sentences), your discount offer (e.g., "20% OFF"), original and discounted prices, address, phone number, and operating hours.',
                      },
                      {
                        step: 3,
                        title: 'Take Great Photos',
                        time: '5 min',
                        details: 'Take 3-5 high-quality photos of your business. Include: exterior shot, interior/ambiance, your best product/service, and any unique features. Photos should be well-lit and in landscape orientation. Max 5MB per photo.',
                      },
                      {
                        step: 4,
                        title: 'Submit Your Listing',
                        time: '3 min',
                        details: 'Go to "My Business" > "New Listing". Fill in all fields, upload your photos, and click "Submit for Approval". Our team reviews submissions within 24 hours.',
                      },
                      {
                        step: 5,
                        title: 'Set Up QR Code Scanning',
                        time: '2 min',
                        details: 'Once approved, tourists will show you their QR code. Simply use any QR scanner app or the StikmNek admin scanner to verify their pass. The discount is confirmed instantly.',
                      },
                    ].map((item) => (
                      <div key={item.step} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                            {item.step}
                          </div>
                          {item.step < 5 && <div className="w-0.5 flex-1 bg-teal-200 mt-2" />}
                        </div>
                        <div className="pb-6">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-bold text-gray-900">{item.title}</h4>
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">{item.time}</span>
                          </div>
                          <p className="text-sm text-gray-600 leading-relaxed">{item.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Tips for Success</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { title: 'Compelling Discount', desc: 'Offer at least 15-20% off to attract tourists. Higher discounts get more visibility.' },
                      { title: 'Great Photos', desc: 'Listings with 3+ photos get 2x more views. Show your best side!' },
                      { title: 'Respond to Reviews', desc: 'Businesses that respond to reviews see 30% more redemptions.' },
                      { title: 'Keep Info Updated', desc: 'Update your hours and offers regularly to maintain accuracy.' },
                    ].map((tip, i) => (
                      <div key={i} className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                        <h4 className="text-sm font-bold text-amber-800 mb-1">{tip.title}</h4>
                        <p className="text-xs text-amber-700">{tip.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Troubleshooting */}
            {activeSection === 'troubleshooting' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Troubleshooting</h2>
                <p className="text-sm text-gray-500 mb-6">Solutions to common issues</p>
                {renderFAQList(filteredTroubleshooting)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpCenter;
