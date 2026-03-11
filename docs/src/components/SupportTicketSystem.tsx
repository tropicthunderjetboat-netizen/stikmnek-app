import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Ticket, Plus, ArrowLeft, Send, Loader2, Clock, CheckCircle,
  AlertCircle, MessageSquare, ChevronRight, Search, Filter,
  X, RefreshCw, User, Shield, Inbox, HelpCircle
} from 'lucide-react';

interface SupportTicket {
  id: string;
  user_email: string;
  user_name: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  admin_notes: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface TicketResponse {
  id: string;
  ticket_id: string;
  responder_name: string;
  responder_type: string;
  message: string;
  created_at: string;
}

const SupportTicketSystem: React.FC = () => {
  const { user, setCurrentView } = useAppContext();
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [responses, setResponses] = useState<TicketResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Create form state
  const [form, setForm] = useState({
    subject: '',
    description: '',
    category: 'general',
    priority: 'medium',
  });

  const categories = [
    { value: 'general', label: 'General Question' },
    { value: 'billing', label: 'Billing & Payments' },
    { value: 'technical', label: 'Technical Issue' },
    { value: 'business', label: 'Business Listing' },
    { value: 'account', label: 'Account & Login' },
    { value: 'feature_request', label: 'Feature Request' },
  ];

  const priorities = [
    { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-600' },
    { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-700' },
    { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700' },
    { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-700' },
  ];

  const statusColors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    waiting: 'bg-purple-100 text-purple-700',
    resolved: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-600',
  };

  const statusLabels: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    waiting: 'Waiting',
    resolved: 'Resolved',
    closed: 'Closed',
  };

  // Load tickets
  const loadTickets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTickets(data || []);
    } catch (err) {
      console.error('Failed to load tickets:', err);
      toast.error('Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // Load ticket responses
  const loadResponses = useCallback(async (ticketId: string) => {
    try {
      const { data, error } = await supabase
        .from('ticket_responses')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setResponses(data || []);
    } catch (err) {
      console.error('Failed to load responses:', err);
    }
  }, []);

  // Create ticket
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.from('support_tickets').insert({
        user_id: user?.id || null,
        user_email: user?.email || 'anonymous@guest.com',
        user_name: user?.name || 'Anonymous',
        subject: form.subject.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority,
      }).select().single();

      if (error) throw error;
      toast.success('Support ticket created successfully!');
      setForm({ subject: '', description: '', category: 'general', priority: 'medium' });
      setView('list');
      await loadTickets();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  // Reply to ticket
  const handleReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('ticket_responses').insert({
        ticket_id: selectedTicket.id,
        responder_id: user?.id || null,
        responder_name: user?.name || 'User',
        responder_type: 'user',
        message: replyText.trim(),
      });
      if (error) throw error;
      toast.success('Reply sent!');
      setReplyText('');
      await loadResponses(selectedTicket.id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send reply');
    } finally {
      setSubmitting(false);
    }
  };

  // Open ticket detail
  const openTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setView('detail');
    loadResponses(ticket.id);
  };

  // Filter tickets
  const filteredTickets = tickets.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (searchQuery && !t.subject.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setCurrentView('home')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </button>
              <div>
                <h1 className="text-xl font-extrabold text-gray-900">Support Center</h1>
                <p className="text-sm text-gray-500">Get help with your StikmNek account</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentView('help' as any)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <HelpCircle className="w-4 h-4" />
                Help Center
              </button>
              {view !== 'create' && (
                <button
                  onClick={() => setView('create')}
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New Ticket
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Create Ticket View */}
        {view === 'create' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Create Support Ticket</h2>
              <button onClick={() => setView('list')} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleCreateTicket} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    {priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject *</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Brief description of your issue"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description *</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none h-32"
                  placeholder="Please describe your issue in detail. Include any error messages, steps to reproduce, and what you expected to happen."
                  maxLength={2000}
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{form.description.length}/2000</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="px-6 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-sm hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {submitting ? 'Creating...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Ticket List View */}
        {view === 'list' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tickets..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {['all', 'open', 'in_progress', 'resolved', 'closed'].map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      statusFilter === status
                        ? 'bg-teal-50 text-teal-700 border border-teal-200'
                        : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {status === 'all' ? 'All' : statusLabels[status]}
                  </button>
                ))}
              </div>
              <button onClick={loadTickets} className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                <RefreshCw className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Ticket List */}
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
              </div>
            ) : filteredTickets.length > 0 ? (
              <div className="space-y-2">
                {filteredTickets.map(ticket => (
                  <button
                    key={ticket.id}
                    onClick={() => openTicket(ticket)}
                    className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-teal-200 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColors[ticket.status]}`}>
                            {statusLabels[ticket.status]}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            priorities.find(p => p.value === ticket.priority)?.color || 'bg-gray-100 text-gray-600'
                          }`}>
                            {ticket.priority}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {categories.find(c => c.value === ticket.category)?.label}
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 truncate">{ticket.subject}</h3>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{ticket.description}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-gray-400">
                          {new Date(ticket.created_at).toLocaleDateString()}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {searchQuery || statusFilter !== 'all' ? 'No matching tickets' : 'No Support Tickets'}
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try adjusting your search or filters'
                    : 'Need help? Create a support ticket and our team will respond promptly.'}
                </p>
                {!searchQuery && statusFilter === 'all' && (
                  <button
                    onClick={() => setView('create')}
                    className="px-6 py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 transition-colors inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create Your First Ticket
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Ticket Detail View */}
        {view === 'detail' && selectedTicket && (
          <div className="space-y-4">
            <button
              onClick={() => { setView('list'); setSelectedTicket(null); }}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Tickets
            </button>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {/* Ticket Header */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusColors[selectedTicket.status]}`}>
                    {statusLabels[selectedTicket.status]}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    priorities.find(p => p.value === selectedTicket.priority)?.color || ''
                  }`}>
                    {selectedTicket.priority}
                  </span>
                  <span className="text-xs text-gray-400">
                    {categories.find(c => c.value === selectedTicket.category)?.label}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-gray-900">{selectedTicket.subject}</h2>
                <p className="text-xs text-gray-400 mt-1">
                  Created {new Date(selectedTicket.created_at).toLocaleString()}
                  {selectedTicket.resolved_at && ` | Resolved ${new Date(selectedTicket.resolved_at).toLocaleString()}`}
                </p>
              </div>

              {/* Original Message */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{selectedTicket.user_name}</p>
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed whitespace-pre-wrap">{selectedTicket.description}</p>
                  </div>
                </div>
              </div>

              {/* Resolution */}
              {selectedTicket.resolution && (
                <div className="p-6 border-b border-gray-100 bg-green-50">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-green-800">Resolution</p>
                      <p className="text-sm text-green-700 mt-1">{selectedTicket.resolution}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Responses */}
              {responses.length > 0 && (
                <div className="divide-y divide-gray-100">
                  {responses.map(resp => (
                    <div key={resp.id} className={`p-6 ${resp.responder_type === 'admin' ? 'bg-blue-50/50' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          resp.responder_type === 'admin' ? 'bg-blue-100' : 'bg-teal-100'
                        }`}>
                          {resp.responder_type === 'admin' ? (
                            <Shield className="w-4 h-4 text-blue-600" />
                          ) : (
                            <User className="w-4 h-4 text-teal-600" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900">{resp.responder_name}</p>
                            {resp.responder_type === 'admin' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700">SUPPORT</span>
                            )}
                            <span className="text-[10px] text-gray-400">{new Date(resp.created_at).toLocaleString()}</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1 leading-relaxed whitespace-pre-wrap">{resp.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Box */}
              {selectedTicket.status !== 'closed' && (
                <div className="p-6 bg-gray-50">
                  <div className="flex gap-3">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your reply..."
                      className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none h-20 bg-white"
                      maxLength={2000}
                    />
                    <button
                      onClick={handleReply}
                      disabled={submitting || !replyText.trim()}
                      className="px-4 py-3 rounded-xl bg-teal-600 text-white font-semibold text-sm hover:bg-teal-700 transition-colors disabled:opacity-50 self-end flex items-center gap-2"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Reply
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportTicketSystem;
