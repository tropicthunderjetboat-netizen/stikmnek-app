import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Mail, Bell, BellOff, Send, Eye, CheckCircle, XCircle,
  AlertCircle, Clock, RefreshCw, ChevronDown, ChevronRight,
  Filter, Search, FileText, Loader2, Settings, Inbox,
  MailOpen, MailX, Star, Store, CreditCard, Shield,
  ToggleLeft, ToggleRight, Sparkles, ArrowRight, ExternalLink
} from 'lucide-react';

interface EmailLog {
  id: string;
  template_key: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  variables: Record<string, any>;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

interface EmailPreferences {
  pass_purchase: boolean;
  business_approval: boolean;
  new_review: boolean;
  marketing: boolean;
  weekly_digest: boolean;
}

interface EmailStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  by_template: Record<string, number>;
  recent_7_days: number;
}

interface EmailTemplate {
  id: string;
  template_key: string;
  subject: string;
  html_body: string;
  description: string;
  variables: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface Props {
  mode: 'user' | 'admin' | 'business';
}

const EmailNotificationCenter: React.FC<Props> = ({ mode }) => {
  const { user } = useAppContext();
  const [activeTab, setActiveTab] = useState<'preferences' | 'history' | 'templates' | 'stats'>('preferences');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // State
  const [preferences, setPreferences] = useState<EmailPreferences>({
    pass_purchase: true,
    business_approval: true,
    new_review: true,
    marketing: false,
    weekly_digest: true,
  });
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string>('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  // Load preferences
  const loadPreferences = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke('send-email', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'get_preferences' },
      });
      if (data?.preferences) {
        setPreferences({
          pass_purchase: data.preferences.pass_purchase ?? true,
          business_approval: data.preferences.business_approval ?? true,
          new_review: data.preferences.new_review ?? true,
          marketing: data.preferences.marketing ?? false,
          weekly_digest: data.preferences.weekly_digest ?? true,
        });
      }
    } catch (err) {
      console.error('Failed to load preferences:', err);
    }
  }, []);

  // Load email logs
  const loadEmailLogs = useCallback(async () => {
    setRefreshing(true);
    try {
      const body: Record<string, any> = { action: 'get_email_logs', limit: 50 };
      if (mode !== 'admin' && user?.email) {
        body.email = user.email;
      }
      if (logFilter !== 'all') {
        body.status_filter = logFilter;
      }
      if (templateFilter !== 'all') {
        body.template_filter = templateFilter;
      }
      const { data } = await supabase.functions.invoke('send-email', { headers: await getEdgeAuthHeaders(), body });
      if (data?.logs) {
        setEmailLogs(data.logs);
        setTotalLogs(data.total || data.logs.length);
      }
    } catch (err) {
      console.error('Failed to load email logs:', err);
    } finally {
      setRefreshing(false);
    }
  }, [mode, user, logFilter, templateFilter]);

  // Load email stats (admin)
  const loadStats = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke('send-email', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'get_email_stats' },
      });
      if (data?.stats) {
        setEmailStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  // Load templates (admin)
  const loadTemplates = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke('send-email', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'get_templates' },
      });
      if (data?.templates) {
        setTemplates(data.templates);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
    loadEmailLogs();
    if (mode === 'admin') {
      loadStats();
      loadTemplates();
    }
  }, [loadPreferences, loadEmailLogs, loadStats, loadTemplates, mode]);

  // Reload logs when filters change
  useEffect(() => {
    loadEmailLogs();
  }, [logFilter, templateFilter, loadEmailLogs]);

  // Update preferences
  const updatePreference = async (key: keyof EmailPreferences, value: boolean) => {
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);
    try {
      await supabase.functions.invoke('send-email', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'update_preferences', preferences: newPrefs },
      });
      toast.success('Email preferences updated');
    } catch (err) {
      toast.error('Failed to update preferences');
      setPreferences(prev => ({ ...prev, [key]: !value }));
    }
  };

  // Toggle template active state
  const toggleTemplate = async (templateKey: string, active: boolean) => {
    try {
      await supabase.functions.invoke('send-email', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'update_template', template_key: templateKey, active },
      });
      setTemplates(prev => prev.map(t =>
        t.template_key === templateKey ? { ...t, active } : t
      ));
      toast.success(`Template ${active ? 'activated' : 'deactivated'}`);
    } catch (err) {
      toast.error('Failed to update template');
    }
  };

  // Preview template
  const previewTemplate = async (templateKey: string) => {
    setLoading(true);
    try {
      const sampleVars: Record<string, string> = {
        user_name: 'John Traveler',
        receipt_number: 'SNK-DEMO-1234',
        pass_type: 'Weekly',
        amount: '45',
        payment_method: 'PayPal',

        expiry_date: 'Saturday, February 21, 2026',
        purchase_date: 'Thursday, February 12, 2026',
        app_url: '#',
        owner_name: 'Jane Business',
        business_name: 'Paradise Beach Bar',
        category: 'Dining',
        location: 'Port Vila, Vanuatu',
        discount: '25% OFF',
        admin_notes: 'Great listing! Welcome to StikmNek.',
        dashboard_url: '#',
        resubmit_url: '#',
        reviewer_name: 'Alex Tourist',
        rating: '5',
        review_text: 'Amazing experience! The food was incredible and the staff was so friendly. Highly recommend to anyone visiting Vanuatu!',
        review_date: 'February 12, 2026',
      };

      const { data } = await supabase.functions.invoke('send-email', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'preview_template', template_key: templateKey, variables: sampleVars },
      });
      if (data?.html) {
        setPreviewHtml(data.html);
        setPreviewSubject(data.subject || '');
      }
    } catch (err) {
      toast.error('Failed to preview template');
    } finally {
      setLoading(false);
    }
  };

  // Send test email
  const sendTestEmail = async (templateKey: string) => {
    if (!user?.email) {
      toast.error('No email address found');
      return;
    }
    setSendingTest(true);
    try {
      const sampleVars: Record<string, string> = {
        user_name: user.name || 'Test User',
        receipt_number: 'SNK-TEST-0000',
        pass_type: 'Weekly',
        amount: '45',
        payment_method: 'Test',
        expiry_date: 'Saturday, February 21, 2026',
        purchase_date: 'Thursday, February 12, 2026',
        app_url: '#',
        owner_name: user.name || 'Test Owner',
        business_name: 'Test Business',
        category: 'Dining',
        location: 'Port Vila, Vanuatu',
        discount: '25% OFF',
        admin_notes: 'This is a test email.',
        dashboard_url: '#',
        resubmit_url: '#',
        reviewer_name: 'Test Reviewer',
        rating: '5',
        review_text: 'This is a test review for email template testing purposes.',
        review_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      };

      const { data } = await supabase.functions.invoke('send-email', {
        headers: await getEdgeAuthHeaders(),
        body: {
          action: 'send_template_email',
          template_key: templateKey,
          recipient_email: user.email,
          recipient_name: user.name,
          variables: sampleVars,
        },
      });
      if (data?.success) {
        toast.success(`Test email sent to ${user.email}`);
        loadEmailLogs();
      } else {
        toast.error('Failed to send test email');
      }
    } catch (err) {
      toast.error('Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'bounced': return <MailX className="w-4 h-4 text-orange-500" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-green-50 text-green-700 border-green-200';
      case 'failed': return 'bg-red-50 text-red-700 border-red-200';
      case 'pending': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'bounced': return 'bg-orange-50 text-orange-700 border-orange-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getTemplateLabel = (key: string) => {
    switch (key) {
      case 'pass_purchase': return 'Pass Purchase';
      case 'business_approved': return 'Business Approved';
      case 'business_rejected': return 'Business Rejected';
      case 'new_review': return 'New Review';
      default: return key;
    }
  };

  const getTemplateIcon = (key: string) => {
    switch (key) {
      case 'pass_purchase': return <CreditCard className="w-4 h-4" />;
      case 'business_approved': return <CheckCircle className="w-4 h-4" />;
      case 'business_rejected': return <XCircle className="w-4 h-4" />;
      case 'new_review': return <Star className="w-4 h-4" />;
      default: return <Mail className="w-4 h-4" />;
    }
  };

  const filteredLogs = emailLogs.filter(log => {
    if (!searchQuery) return true;
    return (
      log.recipient_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.recipient_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const availableTabs = mode === 'admin'
    ? ['preferences', 'history', 'templates', 'stats'] as const
    : ['preferences', 'history'] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Email Notifications</h3>
            <p className="text-xs text-gray-500">
              {mode === 'admin' ? 'Manage templates, logs, and delivery' : 'Manage your email preferences'}
            </p>
          </div>
        </div>
        <button
          onClick={() => { loadEmailLogs(); if (mode === 'admin') { loadStats(); loadTemplates(); } }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 text-gray-600 text-xs font-medium hover:bg-gray-100 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
        {availableTabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === tab
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ═══ PREFERENCES TAB ═══ */}
      {activeTab === 'preferences' && (
        <div className="space-y-3">
          {/* Notification Types */}
          {[
            {
              key: 'pass_purchase' as const,
              label: 'Pass Purchase Confirmations',
              desc: 'Receive a confirmation email with receipt details when you purchase a pass',
              icon: <CreditCard className="w-5 h-5 text-green-600" />,
              color: 'bg-green-50',
            },
            {
              key: 'business_approval' as const,
              label: 'Business Listing Updates',
              desc: 'Get notified when your business listing is approved or needs revision',
              icon: <Store className="w-5 h-5 text-blue-600" />,
              color: 'bg-blue-50',
            },
            {
              key: 'new_review' as const,
              label: 'New Review Alerts',
              desc: 'Receive an email when a customer leaves a review for your business',
              icon: <Star className="w-5 h-5 text-yellow-500" />,
              color: 'bg-yellow-50',
            },
            {
              key: 'marketing' as const,
              label: 'Marketing & Promotions',
              desc: 'Stay updated with special offers, new features, and seasonal deals',
              icon: <Sparkles className="w-5 h-5 text-purple-600" />,
              color: 'bg-purple-50',
            },
            {
              key: 'weekly_digest' as const,
              label: 'Weekly Digest',
              desc: 'A weekly summary of your activity, popular deals, and platform updates',
              icon: <Inbox className="w-5 h-5 text-indigo-600" />,
              color: 'bg-indigo-50',
            },
          ].map(pref => (
            <div
              key={pref.key}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-200 transition-colors"
            >
              <div className={`w-12 h-12 rounded-xl ${pref.color} flex items-center justify-center flex-shrink-0`}>
                {pref.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{pref.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{pref.desc}</p>
              </div>
              <button
                onClick={() => updatePreference(pref.key, !preferences[pref.key])}
                className={`flex-shrink-0 transition-colors ${
                  preferences[pref.key] ? 'text-teal-600' : 'text-gray-300'
                }`}
              >
                {preferences[pref.key] ? (
                  <ToggleRight className="w-10 h-10" />
                ) : (
                  <ToggleLeft className="w-10 h-10" />
                )}
              </button>
            </div>
          ))}

          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-900">Your Privacy Matters</p>
                <p className="text-xs text-blue-700 mt-1">
                  We only send emails you've opted into. Transaction confirmations are recommended to stay enabled for your records.
                  You can change these preferences at any time.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ HISTORY TAB ═══ */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search emails..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="all">All Status</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
              <select
                value={templateFilter}
                onChange={(e) => setTemplateFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="all">All Types</option>
                <option value="pass_purchase">Pass Purchase</option>
                <option value="business_approved">Approved</option>
                <option value="business_rejected">Rejected</option>
                <option value="new_review">New Review</option>
              </select>
            </div>
          </div>

          {/* Email List */}
          {filteredLogs.length > 0 ? (
            <div className="space-y-2">
              {filteredLogs.map(log => (
                <div
                  key={log.id}
                  className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-gray-200 transition-colors"
                >
                  <button
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <div className="flex-shrink-0">
                      {getStatusIcon(log.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-gray-400 flex items-center gap-1">
                          {getTemplateIcon(log.template_key)}
                          {getTemplateLabel(log.template_key)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 truncate">{log.subject}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        To: {log.recipient_name || log.recipient_email}
                        {log.sent_at && ` · ${new Date(log.sent_at).toLocaleString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase border ${getStatusColor(log.status)}`}>
                        {log.status}
                      </span>
                      <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedLog === log.id ? 'rotate-90' : ''}`} />
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {expandedLog === log.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-gray-400 font-medium">Recipient</span>
                          <p className="text-gray-700 font-semibold mt-0.5">{log.recipient_email}</p>
                        </div>
                        <div>
                          <span className="text-gray-400 font-medium">Template</span>
                          <p className="text-gray-700 font-semibold mt-0.5">{getTemplateLabel(log.template_key)}</p>
                        </div>
                        <div>
                          <span className="text-gray-400 font-medium">Created</span>
                          <p className="text-gray-700 font-semibold mt-0.5">{new Date(log.created_at).toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="text-gray-400 font-medium">Delivered</span>
                          <p className="text-gray-700 font-semibold mt-0.5">
                            {log.sent_at ? new Date(log.sent_at).toLocaleString() : 'Not yet'}
                          </p>
                        </div>
                      </div>
                      {log.error_message && (
                        <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-100">
                          <p className="text-xs font-medium text-red-700">Error: {log.error_message}</p>
                        </div>
                      )}
                      {log.variables && Object.keys(log.variables).length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-gray-400 font-medium mb-1.5">Template Variables</p>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(log.variables).filter(([k]) => !['user_id', 'stars_html'].includes(k)).map(([key, val]) => (
                              <span key={key} className="px-2 py-1 rounded-md bg-gray-50 text-[10px] text-gray-600">
                                <span className="font-semibold">{key}:</span> {String(val).substring(0, 30)}{String(val).length > 30 ? '...' : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-12 border border-gray-100 text-center">
              <MailOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h4 className="text-base font-bold text-gray-900 mb-1">No Emails Found</h4>
              <p className="text-sm text-gray-500">
                {searchQuery || logFilter !== 'all' || templateFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Email notifications will appear here when sent'}
              </p>
            </div>
          )}

          {totalLogs > 50 && (
            <p className="text-center text-xs text-gray-400">
              Showing {filteredLogs.length} of {totalLogs} emails
            </p>
          )}
        </div>
      )}

      {/* ═══ TEMPLATES TAB (Admin Only) ═══ */}
      {activeTab === 'templates' && mode === 'admin' && (
        <div className="space-y-4">
          {templates.map(template => (
            <div
              key={template.id}
              className={`bg-white rounded-xl border overflow-hidden transition-colors ${
                template.active ? 'border-gray-100' : 'border-red-100 bg-red-50/30'
              }`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      template.active ? 'bg-teal-50 text-teal-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {getTemplateIcon(template.template_key)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        {getTemplateLabel(template.template_key)}
                        {!template.active && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600">DISABLED</span>
                        )}
                      </h4>
                      <p className="text-xs text-gray-500">{template.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleTemplate(template.template_key, !template.active)}
                    className={`transition-colors ${template.active ? 'text-teal-600' : 'text-gray-300'}`}
                  >
                    {template.active ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                  </button>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg mb-3">
                  <p className="text-xs text-gray-400 font-medium mb-1">Subject Line</p>
                  <p className="text-sm text-gray-700 font-mono">{template.subject}</p>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {template.variables?.map(v => (
                    <span key={v} className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-semibold">
                      {'{{' + v + '}}'}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => previewTemplate(template.template_key)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </button>
                  <button
                    onClick={() => sendTestEmail(template.template_key)}
                    disabled={sendingTest}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition-colors"
                  >
                    {sendingTest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send Test
                  </button>
                  <span className="text-[10px] text-gray-400 ml-auto">
                    Updated {new Date(template.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {templates.length === 0 && (
            <div className="bg-white rounded-xl p-12 border border-gray-100 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h4 className="text-base font-bold text-gray-900 mb-1">No Templates Found</h4>
              <p className="text-sm text-gray-500">Email templates will appear here once created.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ STATS TAB (Admin Only) ═══ */}
      {activeTab === 'stats' && mode === 'admin' && emailStats && (
        <div className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-4 h-4 text-indigo-600" />
                <span className="text-xs text-gray-500 font-medium">Total Sent</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{emailStats.total}</p>
              <p className="text-xs text-gray-400 mt-0.5">all time</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-xs text-gray-500 font-medium">Delivered</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{emailStats.sent}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {emailStats.total > 0 ? `${Math.round((emailStats.sent / emailStats.total) * 100)}% rate` : '0% rate'}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-xs text-gray-500 font-medium">Failed</span>
              </div>
              <p className="text-2xl font-bold text-red-500">{emailStats.failed}</p>
              <p className="text-xs text-gray-400 mt-0.5">needs attention</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span className="text-xs text-gray-500 font-medium">Last 7 Days</span>
              </div>
              <p className="text-2xl font-bold text-purple-600">{emailStats.recent_7_days}</p>
              <p className="text-xs text-gray-400 mt-0.5">recent activity</p>
            </div>
          </div>

          {/* By Template Breakdown */}
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <h4 className="text-sm font-bold text-gray-900 mb-4">Emails by Template</h4>
            <div className="space-y-3">
              {Object.entries(emailStats.by_template).map(([key, count]) => {
                const pct = emailStats.total > 0 ? (count / emailStats.total) * 100 : 0;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="flex items-center gap-1.5 text-gray-600 font-medium">
                        {getTemplateIcon(key)}
                        {getTemplateLabel(key)}
                      </span>
                      <span className="font-bold text-gray-900">{count} ({Math.round(pct)}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {emailStats.pending > 0 && (
            <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-100">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-yellow-800">
                    {emailStats.pending} email{emailStats.pending > 1 ? 's' : ''} pending delivery
                  </p>
                  <p className="text-xs text-yellow-600 mt-0.5">
                    These emails are queued and will be delivered shortly.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ TEMPLATE PREVIEW MODAL ═══ */}
      {previewHtml && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Email Preview</h3>
                <p className="text-xs text-gray-500 mt-0.5">{previewSubject}</p>
              </div>
              <button
                onClick={() => { setPreviewHtml(null); setPreviewSubject(''); }}
                className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <XCircle className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-50">
              <div
                className="bg-white rounded-xl shadow-sm mx-auto max-w-[600px]"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailNotificationCenter;
