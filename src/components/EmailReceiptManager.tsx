import React, { useState, useEffect, useRef } from 'react';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Mail, Send, Eye, EyeOff, CheckCircle, XCircle, AlertTriangle,
  Loader2, Receipt, FileText, Copy, Check, ArrowLeft, RefreshCw,
  Building2, MapPin, Tag, CreditCard, Calendar, User, AtSign,
  ChevronDown, ChevronUp, ExternalLink, Info, Zap, Shield,
  Download, Printer
} from 'lucide-react';

interface ReceiptVars {
  customer_name: string;
  customer_email: string;
  receipt_number: string;
  transaction_date: string;
  item_description: string;
  payment_method: string;
  amount: string;
  valid_from: string;
  valid_until: string;
  business_name: string;
  business_category: string;
  business_location: string;
  business_discount: string;
  dashboard_url: string;
}

interface SendResult {
  success: boolean;
  provider?: string;
  error?: string;
  details?: any;
  receipt_number?: string;
  emailId?: string;
}

interface Props {
  onBack?: () => void;
}

const defaultVars: ReceiptVars = {
  customer_name: 'Vanuatu Watersports',
  customer_email: 'Vanuatuwatersports@gmail.com',
  receipt_number: '',
  transaction_date: '',
  item_description: 'StikmNek Extended Group Adventure Pass',

  payment_method: 'Credit Card',
  amount: '45',
  valid_from: '',
  valid_until: '',
  business_name: 'Vanuatu Watersports',
  business_category: 'Water Activities & Tours',
  business_location: 'Port Vila, Vanuatu',
  business_discount: '25% OFF All Water Activities',
  dashboard_url: 'https://www.stikmnek.com/dashboard',
};

const EmailReceiptManager: React.FC<Props> = ({ onBack }) => {
  const [vars, setVars] = useState<ReceiptVars>(() => {
    const now = new Date();
    const weekLater = new Date(now);
    weekLater.setDate(weekLater.getDate() + 7);
    return {
      ...defaultVars,
      receipt_number: `SNK-${Date.now().toString(36).toUpperCase().slice(0, 6)}-TEST`,
      transaction_date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      valid_from: now.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }),
      valid_until: weekLater.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }),
    };
  });

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('Vanuatuwatersports@gmail.com');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Load recent receipt email logs
  const loadRecentLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data } = await supabase.functions.invoke('send-email', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'get_email_logs', template_filter: 'payment_receipt', limit: 10 },
      });
      if (data?.logs) {
        setEmailLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadRecentLogs();
  }, []);

  // Preview the receipt template
  const handlePreview = async () => {
    setLoadingPreview(true);
    try {
      const { data } = await supabase.functions.invoke('send-email', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'preview_template', template_key: 'payment_receipt', variables: vars },
      });
      if (data?.html) {
        setPreviewHtml(data.html);
        setShowPreview(true);
      } else {
        toast.error('Failed to generate preview');
      }
    } catch (err) {
      toast.error('Failed to load preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Send test receipt
  const handleSendTest = async () => {
    if (!recipientEmail) {
      toast.error('Please enter a recipient email');
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const { data } = await supabase.functions.invoke('send-email', {
        headers: await getEdgeAuthHeaders(),
        body: {
          action: 'send_test_receipt',
          recipient_email: recipientEmail,
          recipient_name: vars.customer_name,
          ...vars,
        },
      });
      setSendResult(data);
      if (data?.success) {
        toast.success(`Receipt sent to ${recipientEmail}!`);
        loadRecentLogs();
      } else {
        toast.error('Email delivery failed - see details below');
      }
    } catch (err: any) {
      setSendResult({ success: false, error: err.message });
      toast.error('Failed to send email');
    } finally {
      setSending(false);
    }
  };

  // Resend a failed email
  const handleResend = async (logId: string) => {
    try {
      const { data } = await supabase.functions.invoke('send-email', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'resend_email', email_log_id: logId },
      });
      if (data?.success) {
        toast.success('Email resent successfully!');
      } else {
        toast.error('Resend failed');
      }
      loadRecentLogs();
    } catch {
      toast.error('Failed to resend');
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const updateVar = (key: keyof ReceiptVars, value: string) => {
    setVars(prev => ({ ...prev, [key]: value }));
  };

  const printPreview = () => {
    if (!previewHtml) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(previewHtml);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
          )}
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-teal-200">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Payment Receipt Emails</h2>
            <p className="text-sm text-gray-500">Create, preview, and send payment receipt emails</p>
          </div>
        </div>
      </div>

      {/* Resend: verify sending domain + from address */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-amber-900">Resend — domain & sender</h4>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              Transactional mail uses <strong>Resend</strong>. Add and verify your domain at Resend, then set{' '}
              <code className="px-1.5 py-0.5 bg-amber-100 rounded text-amber-800 font-mono text-[10px]">RESEND_API_KEY</code> and{' '}
              <code className="px-1.5 py-0.5 bg-amber-100 rounded text-amber-800 font-mono text-[10px]">RESEND_FROM_EMAIL</code>{' '}
              (e.g. <code className="px-1 py-0.5 bg-amber-100 rounded font-mono text-[10px]">no-reply@stikmnek.com</code>) in Supabase Edge Function secrets.
            </p>
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800">Setup:</p>
              <ol className="text-xs text-amber-700 space-y-1.5 ml-4 list-decimal">
                <li>
                  <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="text-amber-900 underline font-semibold inline-flex items-center gap-0.5">
                    Resend Domains <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  — add <code className="font-mono text-[10px]">stikmnek.com</code> and complete DNS records
                </li>
                <li>Create an API key and add it as <code className="font-mono text-[10px]">RESEND_API_KEY</code> for functions <code className="font-mono text-[10px]">send-email</code>, <code className="font-mono text-[10px]">manage-business</code>, <code className="font-mono text-[10px]">paypal-capture</code></li>
                <li>Match <code className="font-mono text-[10px]">RESEND_FROM_EMAIL</code> to an address on the verified domain</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Receipt Form */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                Receipt Details
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Fill in the details for the receipt email</p>
            </div>

            <div className="p-5 space-y-4">
              {/* Recipient Email */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                  <AtSign className="w-3.5 h-3.5 text-teal-600" />
                  Send To (Recipient Email)
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="email@example.com"
                />
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    Customer Name
                  </label>
                  <input
                    type="text"
                    value={vars.customer_name}
                    onChange={(e) => updateVar('customer_name', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-green-600" />
                    Amount (AUD)

                  </label>
                  <input
                    type="text"
                    value={vars.amount}
                    onChange={(e) => updateVar('amount', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Item & Payment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                    <Tag className="w-3.5 h-3.5 text-purple-600" />
                    Item Description
                  </label>
                  <input
                    type="text"
                    value={vars.item_description}
                    onChange={(e) => updateVar('item_description', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                    Payment Method
                  </label>
                  <input
                    type="text"
                    value={vars.payment_method}
                    onChange={(e) => updateVar('payment_method', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Business Details Section */}
              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="flex items-center gap-2 text-xs font-bold text-gray-700">
                    <Building2 className="w-3.5 h-3.5 text-amber-600" />
                    Business Details (for receipt)
                  </span>
                  {showAdvanced ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Business Name</label>
                      <input
                        type="text"
                        value={vars.business_name}
                        onChange={(e) => updateVar('business_name', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Category</label>
                        <input
                          type="text"
                          value={vars.business_category}
                          onChange={(e) => updateVar('business_category', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Location</label>
                        <input
                          type="text"
                          value={vars.business_location}
                          onChange={(e) => updateVar('business_location', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Discount Offer</label>
                      <input
                        type="text"
                        value={vars.business_discount}
                        onChange={(e) => updateVar('business_discount', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Receipt Number</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={vars.receipt_number}
                          onChange={(e) => updateVar('receipt_number', e.target.value)}
                          className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                        <button
                          onClick={() => copyToClipboard(vars.receipt_number, 'receipt')}
                          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          {copiedField === 'receipt' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handlePreview}
                  disabled={loadingPreview}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {loadingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  Preview
                </button>
                <button
                  onClick={handleSendTest}
                  disabled={sending || !recipientEmail}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold text-sm hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200 disabled:opacity-50 disabled:shadow-none"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Test Receipt
                </button>
              </div>
            </div>
          </div>

          {/* Send Result */}
          {sendResult && (
            <div className={`rounded-2xl border p-5 ${
              sendResult.success 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start gap-3">
                {sendResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className={`text-sm font-bold ${sendResult.success ? 'text-green-900' : 'text-red-900'}`}>
                    {sendResult.success ? 'Receipt Sent Successfully!' : 'Email Delivery Failed'}
                  </h4>
                  {sendResult.success && (
                    <p className="text-xs text-green-700 mt-1">
                      Delivered via <strong>{sendResult.provider}</strong> to {recipientEmail}
                    </p>
                  )}
                  {sendResult.error && (
                    <p className="text-xs text-red-700 mt-1">{sendResult.error}</p>
                  )}
                  {sendResult.receipt_number && (
                    <p className="text-xs text-gray-600 mt-1 font-mono">
                      Receipt: {sendResult.receipt_number}
                    </p>
                  )}

                  {/* Detailed error info */}
                  {sendResult.details && !sendResult.success && (
                    <div className="mt-3 space-y-2">
                      {(sendResult.details.resend || sendResult.details.sendgrid) && (
                        <div className="p-3 bg-white/60 rounded-xl">
                          <p className="text-[10px] font-bold text-red-800 uppercase tracking-wider mb-1">Email API response</p>
                          <p className="text-xs text-red-700 font-mono break-all">
                            {(() => {
                              const d = sendResult.details.resend ?? sendResult.details.sendgrid;
                              const code = d?.statusCode ?? d?.status;
                              const raw = d?.response ?? d?.body ?? '';
                              try {
                                const parsed = JSON.parse(raw || '{}');
                                return `Status ${code}: ${parsed.message ?? parsed.errors?.[0]?.message ?? d?.error ?? raw}`;
                              } catch {
                                return `Status ${code}: ${d?.error ?? raw}`;
                              }
                            })()}
                          </p>
                        </div>
                      )}
                      {typeof sendResult.details === 'string' && sendResult.details.trim() && (
                        <div className="p-3 bg-white/60 rounded-xl">
                          <p className="text-[10px] font-bold text-red-800 uppercase tracking-wider mb-1">Email API response</p>
                          <p className="text-xs text-red-700 font-mono break-all">
                            {(() => {
                              try {
                                const parsed = JSON.parse(sendResult.details);
                                return parsed.message ?? parsed.error ?? sendResult.details;
                              } catch {
                                return sendResult.details;
                              }
                            })()}
                          </p>
                        </div>
                      )}
                      {sendResult.details.gateway && (
                        <div className="p-3 bg-white/60 rounded-xl">
                          <p className="text-[10px] font-bold text-red-800 uppercase tracking-wider mb-1">Gateway response</p>
                          <p className="text-xs text-red-700 font-mono break-all">
                            Status {sendResult.details.gateway.statusCode}: {
                              (() => {
                                try {
                                  const parsed = JSON.parse(sendResult.details.gateway.response || '{}');
                                  return parsed.message || sendResult.details.gateway.error;
                                } catch { return sendResult.details.gateway.error; }
                              })()
                            }
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Recent Email Logs */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-600" />
                Recent Receipt Emails
              </h3>
              <button
                onClick={loadRecentLogs}
                disabled={loadingLogs}
                className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${loadingLogs ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {emailLogs.length > 0 ? emailLogs.map(log => (
                <div key={log.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {log.status === 'sent' ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : log.status === 'failed' ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{log.recipient_email}</p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(log.created_at).toLocaleString()} · {log.subject?.substring(0, 40)}...
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${
                      log.status === 'sent' ? 'bg-green-50 text-green-700' :
                      log.status === 'failed' ? 'bg-red-50 text-red-700' :
                      'bg-yellow-50 text-yellow-700'
                    }`}>
                      {log.status}
                    </span>
                    {log.status === 'failed' && (
                      <button
                        onClick={() => handleResend(log.id)}
                        className="p-1 rounded hover:bg-gray-100 transition-colors"
                        title="Resend"
                      >
                        <RefreshCw className="w-3 h-3 text-gray-400" />
                      </button>
                    )}
                  </div>
                </div>
              )) : (
                <div className="px-5 py-8 text-center">
                  <Mail className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No receipt emails sent yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden sticky top-20">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Eye className="w-4 h-4 text-purple-600" />
                Email Preview
              </h3>
              <div className="flex items-center gap-2">
                {previewHtml && (
                  <>
                    <button
                      onClick={printPreview}
                      className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                      title="Print preview"
                    >
                      <Printer className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  </>
                )}
                <button
                  onClick={handlePreview}
                  disabled={loadingPreview}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 text-xs font-semibold hover:bg-purple-100 transition-colors"
                >
                  {loadingPreview ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {previewHtml ? 'Refresh' : 'Load Preview'}
                </button>
              </div>
            </div>

            <div ref={previewRef} className="bg-gray-100 overflow-auto" style={{ maxHeight: '75vh' }}>
              {previewHtml ? (
                <div
                  className="transform scale-[0.65] origin-top-left"
                  style={{ width: '154%' }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gray-200 flex items-center justify-center mx-auto mb-4">
                    <Receipt className="w-8 h-8 text-gray-400" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-700 mb-1">No Preview Yet</h4>
                  <p className="text-xs text-gray-500 mb-4">Click "Preview" or "Load Preview" to see the receipt email template</p>
                  <button
                    onClick={handlePreview}
                    disabled={loadingPreview}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-colors"
                  >
                    {loadingPreview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    Generate Preview
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Template Info Card */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 p-5">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-indigo-900">About This Template</h4>
                <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                  This payment receipt template includes a <strong>Business Details</strong> section 
                  that can be filled with specific business information when sending receipts. 
                  The template uses <code className="px-1 py-0.5 bg-indigo-100 rounded font-mono text-[10px]">{'{{variable}}'}</code> placeholders 
                  that get replaced with actual data.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {['customer_name', 'receipt_number', 'amount', 'business_name', 'business_discount'].map(v => (
                    <span key={v} className="px-2 py-1 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-mono font-semibold">
                      {`{{${v}}}`}
                    </span>
                  ))}
                  <span className="px-2 py-1 rounded-md bg-indigo-100 text-indigo-500 text-[10px] font-semibold">
                    +9 more
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full-screen Preview Modal */}
      {showPreview && previewHtml && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Receipt Email Preview</h3>
                <p className="text-xs text-gray-500 mt-0.5">StikmNek Payment Receipt - {vars.receipt_number}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={printPreview}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  <XCircle className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-gray-100">
              <div
                className="mx-auto max-w-[620px]"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailReceiptManager;
