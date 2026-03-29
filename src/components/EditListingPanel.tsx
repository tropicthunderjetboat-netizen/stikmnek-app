import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Business } from '@/data/businesses';

import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Edit3, X, RotateCcw, Eye, Clock, Phone, MapPin,
  Tag, DollarSign, FileText, ShieldCheck, Loader2,
  CheckCircle, XCircle, AlertCircle, ArrowRight, History,
  RefreshCw, Power, Undo2, Info, Star,
  Hash, Sparkles, Percent, Type, MessageCircle, Trash2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  plainTextFromHtml,
  BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX,
  BUSINESS_DESCRIPTION_PLAIN_TEXT_SOFT_LIMIT,
} from '@/lib/businessDescriptionHtml';
import BusinessDescriptionEditor from './BusinessDescriptionEditor';
import { effectiveProfileBusinessId } from '@/lib/businessOfferingMap';


interface PendingEdit {
  id: string;
  business_id: string;
  owner_id: string;
  changes: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string;
  submitted_at: string;
  reviewed_at: string | null;
}

interface EditListingPanelProps {
  selectedBusiness: Business;
  onToggleActive: (active: boolean) => void;
  /** Called after the listing is successfully deleted (refresh parent list). */
  onListingDeleted?: () => void | Promise<void>;
  initialSection?: 'basic' | 'pricing' | 'contact' | 'media';
}

type EditSection = 'basic' | 'pricing' | 'contact' | 'media';

interface EditFormData {
  description: string;
  hours: string;
  phone: string;
  discount: string;
  deal_price: number;
  original_price: number;
  location: string;
  tags: string[];
  whatsapp_number: string;
}

// WhatsApp SVG Icon component
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

// Validate WhatsApp number format
const validateWhatsAppNumber = (number: string): { valid: boolean; message: string } => {
  if (!number || number.trim() === '') {
    return { valid: true, message: '' }; // Empty is valid (optional field)
  }
  const cleaned = number.replace(/[\s\-\(\)]/g, '');
  if (!/^\+?\d+$/.test(cleaned)) {
    return { valid: false, message: 'Only digits, spaces, and + are allowed' };
  }
  const digitsOnly = cleaned.replace(/\+/, '');
  if (digitsOnly.length < 7) {
    return { valid: false, message: 'Number is too short (min 7 digits)' };
  }
  if (digitsOnly.length > 15) {
    return { valid: false, message: 'Number is too long (max 15 digits)' };
  }
  if (!cleaned.startsWith('+')) {
    return { valid: false, message: 'Include country code (e.g. +678)' };
  }
  return { valid: true, message: 'Valid WhatsApp number' };
};

const EditListingPanel: React.FC<EditListingPanelProps> = ({
  selectedBusiness,
  onToggleActive,
  onListingDeleted,
  initialSection,
}) => {
  const { user } = useAppContext();
  const profileId = effectiveProfileBusinessId(
    selectedBusiness as Business & { _profileBusinessId?: string },
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeSection, setActiveSection] = useState<EditSection>(initialSection || 'basic');

  // Update active section when initialSection prop changes (e.g., from deal expiry banner)
  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);


  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [loadingEdits, setLoadingEdits] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Form state
  const [form, setForm] = useState<EditFormData>({
    description: '',
    hours: '',
    phone: '',
    discount: '',
    deal_price: 0,
    original_price: 0,
    location: '',
    tags: [],
    whatsapp_number: '',
  });

  const [original, setOriginal] = useState<EditFormData>({
    description: '',
    hours: '',
    phone: '',
    discount: '',
    deal_price: 0,
    original_price: 0,
    location: '',
    tags: [],
    whatsapp_number: '',
  });

  // WhatsApp validation state
  const whatsappValidation = useMemo(() => validateWhatsAppNumber(form.whatsapp_number), [form.whatsapp_number]);

  // Initialize form from selected business
  useEffect(() => {
    if (selectedBusiness) {
      const data: EditFormData = {
        description: selectedBusiness.description,
        hours: selectedBusiness.hours,
        phone: selectedBusiness.phone,
        discount: selectedBusiness.discount,
        deal_price: selectedBusiness.dealPrice,
        original_price: selectedBusiness.originalPrice,
        location: selectedBusiness.location,
        tags: selectedBusiness.tags || [],
        whatsapp_number: selectedBusiness.whatsappNumber || '',
      };
      setForm(data);
      setOriginal(data);
    }
  }, [selectedBusiness]);

  // Load pending edits
  useEffect(() => {
    loadPendingEdits();
  }, [selectedBusiness, user]);

  const loadPendingEdits = async () => {
    if (!selectedBusiness || !user) return;
    setLoadingEdits(true);
    try {
      const { data } = await supabase.functions.invoke('manage-business', {
        body: { action: 'get_pending_edits', userId: user.id, businessId: profileId },
      });
      if (data?.edits) setPendingEdits(data.edits);
    } catch (err) {
      console.error('Failed to load pending edits:', err);
    } finally {
      setLoadingEdits(false);
    }
  };

  // Track changes
  const changedFields = useMemo(() => {
    const changes: string[] = [];
    if (form.description !== original.description) changes.push('description');
    if (form.hours !== original.hours) changes.push('hours');
    if (form.phone !== original.phone) changes.push('phone');
    if (form.discount !== original.discount) changes.push('discount');
    if (form.deal_price !== original.deal_price) changes.push('deal_price');
    if (form.original_price !== original.original_price) changes.push('original_price');
    if (form.location !== original.location) changes.push('location');
    if (JSON.stringify(form.tags) !== JSON.stringify(original.tags)) changes.push('tags');
    if (form.whatsapp_number !== original.whatsapp_number) changes.push('whatsapp_number');
    return changes;
  }, [form, original]);

  const hasChanges = changedFields.length > 0;
  const currentPendingEdit = pendingEdits.find(e => e.business_id === profileId && e.status === 'pending');
  const editHistory = pendingEdits.filter(e => e.business_id === profileId);

  const isFieldChanged = (field: string) => changedFields.includes(field);

  const resetField = (field: keyof EditFormData) => {
    setForm(prev => ({ ...prev, [field]: original[field] }));
  };

  const resetAll = () => {
    setForm({ ...original });
    toast.info('All changes reverted');
  };

  const handleAddTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !form.tags.includes(tag)) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const handleSubmit = async () => {
    if (!selectedBusiness || !user || !hasChanges) {
      if (!hasChanges) toast.info('No changes to submit.');
      return;
    }

    // Validate WhatsApp number before submitting
    if (changedFields.includes('whatsapp_number') && form.whatsapp_number.trim() !== '') {
      const validation = validateWhatsAppNumber(form.whatsapp_number);
      if (!validation.valid) {
        toast.error(`Invalid WhatsApp number: ${validation.message}`);
        return;
      }
    }

    if (changedFields.includes('description')) {
      const descLen = plainTextFromHtml(form.description).length;
      if (descLen > BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX) {
        toast.error(
          `Description must be ${BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX} characters or fewer (plain text).`,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const changes: Record<string, any> = {};
      changedFields.forEach(field => {
        const value = (form as any)[field];
        // For whatsapp_number, send null if empty string (to allow removal)
        if (field === 'whatsapp_number') {
          changes[field] = value.trim() === '' ? null : value.trim();
        } else {
          changes[field] = value;
        }
      });

      const { data, error } = await supabase.functions.invoke('manage-business', {
        body: { action: 'submit_edit', userId: user.id, businessId: profileId, changes },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.updated ? 'Pending edit updated successfully!' : 'Edit submitted for admin review!');
      await loadPendingEdits();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit edit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (active: boolean) => {
    setIsActive(active);
    onToggleActive(active);
  };

  const isOwner =
    !!user?.id &&
    selectedBusiness.ownerId != null &&
    String(selectedBusiness.ownerId) === String(user.id);

  const handleConfirmDelete = async () => {
    if (!user || !isOwner) {
      toast.error('Only the listing owner can delete this business.');
      return;
    }
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-business', {
        body: { action: 'delete_own_business', businessId: profileId },
      });
      const res = data as { success?: boolean; error?: string } | null | undefined;
      if (error) {
        throw new Error(res?.error || error.message || 'Failed to delete listing');
      }
      if (!res?.success) {
        throw new Error(res?.error || 'Failed to delete listing');
      }
      toast.success(`“${selectedBusiness.name}” has been removed.`);
      setDeleteDialogOpen(false);
      await onListingDeleted?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete listing';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  // Calculate savings percentage
  const savingsPercent = form.original_price > 0
    ? Math.round(((form.original_price - form.deal_price) / form.original_price) * 100)
    : 0;

  const sections: { key: EditSection; label: string; icon: React.ReactNode; fields: string[] }[] = [
    { key: 'basic', label: 'Basic Info', icon: <FileText className="w-4 h-4" />, fields: ['description', 'location', 'tags'] },
    { key: 'pricing', label: 'Pricing & Deals', icon: <DollarSign className="w-4 h-4" />, fields: ['discount', 'original_price', 'deal_price'] },
    { key: 'contact', label: 'Contact & Hours', icon: <Phone className="w-4 h-4" />, fields: ['phone', 'hours', 'whatsapp_number'] },
    { key: 'media', label: 'Preview', icon: <Eye className="w-4 h-4" />, fields: [] },
  ];

  const getSectionChangeCount = (section: EditSection) => {
    const s = sections.find(s => s.key === section);
    if (!s) return 0;
    return s.fields.filter(f => changedFields.includes(f)).length;
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Pending Edit Banner */}
      {currentPendingEdit && (
        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-2xl border border-yellow-200 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-yellow-800 flex items-center gap-2">
                Edit Pending Review
                <span className="px-2 py-0.5 rounded-full bg-yellow-200 text-yellow-800 text-[10px] font-bold uppercase tracking-wider">
                  Awaiting Approval
                </span>
              </h4>
              <p className="text-xs text-yellow-700 mt-1">
                Submitted {new Date(currentPendingEdit.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
                You can update your pending changes below.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(currentPendingEdit.changes).map(([key]) => (
                  <span key={key} className="px-2 py-0.5 rounded-lg bg-white border border-yellow-200 text-xs">
                    <span className="font-semibold text-yellow-800 capitalize">{key.replace(/_/g, ' ')}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Approval Notice */}
      <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-2xl border border-teal-200 p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-teal-800">Changes Require Admin Approval</p>
          <p className="text-xs text-teal-600 mt-0.5">
            All listing edits are reviewed by our team before going live. Toggle listing status takes effect immediately.
          </p>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {sections.map(section => {
            const changeCount = getSectionChangeCount(section.key);
            return (
              <button
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                  activeSection === section.key
                    ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className={activeSection === section.key ? 'text-teal-600' : 'text-gray-400'}>
                  {section.icon}
                </span>
                {section.label}
                {changeCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold">
                    {changeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* Basic Info Section */}
          {activeSection === 'basic' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-600" />
                  Basic Information
                </h3>
                {changedFields.some(f => ['description', 'location', 'tags'].includes(f)) && (
                  <button
                    onClick={() => {
                      resetField('description');
                      resetField('location');
                      resetField('tags');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Reset Section
                  </button>
                )}
              </div>

              {/* Business Name (read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                  <Type className="w-3.5 h-3.5 text-gray-400" />
                  Business Name
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Read Only</span>
                </label>
                <input
                  type="text"
                  value={selectedBusiness.name}
                  disabled
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500 cursor-not-allowed"
                />
                <p className="text-[11px] text-gray-400 mt-1">Contact support to change your business name.</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-gray-400" />
                  Description
                  {isFieldChanged('description') && (
                    <span className="flex items-center gap-1 text-[10px] text-orange-500 font-semibold bg-orange-50 px-1.5 py-0.5 rounded">
                      <Edit3 className="w-2.5 h-2.5" /> Modified
                    </span>
                  )}
                </label>
                <div className="relative">
                  <BusinessDescriptionEditor
                    value={form.description}
                    onChange={(html) => setForm((prev) => ({ ...prev, description: html }))}
                    placeholder="Describe your business to tourists..."
                    quillClassName="[&_.ql-editor]:min-h-[8rem]"
                    className={
                      isFieldChanged('description') ? 'border-orange-300 bg-orange-50/30' : undefined
                    }
                  />
                  {isFieldChanged('description') && (
                    <button
                      type="button"
                      onClick={() => resetField('description')}
                      className="absolute top-10 right-2 z-10 p-1 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
                      title="Undo changes"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[11px] text-gray-400">Write a compelling description for tourists</p>
                  <span
                    className={`text-[11px] font-medium ${
                      plainTextFromHtml(form.description).length > BUSINESS_DESCRIPTION_PLAIN_TEXT_SOFT_LIMIT
                        ? 'text-orange-500'
                        : 'text-gray-400'
                    }`}
                  >
                    {plainTextFromHtml(form.description).length}/{BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX}
                  </span>
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  Location
                  {isFieldChanged('location') && (
                    <span className="flex items-center gap-1 text-[10px] text-orange-500 font-semibold bg-orange-50 px-1.5 py-0.5 rounded">
                      <Edit3 className="w-2.5 h-2.5" /> Modified
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors ${
                      isFieldChanged('location') ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200'
                    }`}
                    placeholder="e.g. Seafront, Port Vila"
                  />
                  {isFieldChanged('location') && (
                    <button
                      onClick={() => resetField('location')}
                      className="absolute top-1/2 -translate-y-1/2 right-2 p-1 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5 text-gray-400" />
                  Tags
                  {isFieldChanged('tags') && (
                    <span className="flex items-center gap-1 text-[10px] text-orange-500 font-semibold bg-orange-50 px-1.5 py-0.5 rounded">
                      <Edit3 className="w-2.5 h-2.5" /> Modified
                    </span>
                  )}
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {form.tags.map(tag => (
                    <span
                      key={tag}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 text-xs font-medium"
                    >
                      #{tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="text-teal-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {form.tags.length === 0 && (
                    <span className="text-xs text-gray-400 italic">No tags added yet</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Add a tag (e.g. seafood, waterfront)"
                    maxLength={30}
                  />
                  <button
                    onClick={handleAddTag}
                    disabled={!newTag.trim()}
                    className="px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Tags help tourists find your business. Press Enter or click Add.</p>
              </div>
            </div>
          )}

          {/* Pricing & Deals Section */}
          {activeSection === 'pricing' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-teal-600" />
                  Pricing & Deals
                </h3>
                {changedFields.some(f => ['discount', 'original_price', 'deal_price'].includes(f)) && (
                  <button
                    onClick={() => {
                      resetField('discount');
                      resetField('original_price');
                      resetField('deal_price');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Reset Section
                  </button>
                )}
              </div>

              {/* Discount Label */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                  <Percent className="w-3.5 h-3.5 text-gray-400" />
                  Discount Label
                  {isFieldChanged('discount') && (
                    <span className="flex items-center gap-1 text-[10px] text-orange-500 font-semibold bg-orange-50 px-1.5 py-0.5 rounded">
                      <Edit3 className="w-2.5 h-2.5" /> Modified
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.discount}
                    onChange={(e) => setForm(prev => ({ ...prev, discount: e.target.value }))}
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors ${
                      isFieldChanged('discount') ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200'
                    }`}
                    placeholder="e.g. 25% OFF, Buy 1 Get 1, Free Dessert"
                  />
                  {isFieldChanged('discount') && (
                    <button
                      onClick={() => resetField('discount')}
                      className="absolute top-1/2 -translate-y-1/2 right-2 p-1 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">This appears as a badge on your listing card</p>
              </div>

              {/* Price Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                    <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                    Original Price (VT)
                    {isFieldChanged('original_price') && (
                      <span className="flex items-center gap-1 text-[10px] text-orange-500 font-semibold bg-orange-50 px-1.5 py-0.5 rounded">
                        <Edit3 className="w-2.5 h-2.5" /> Modified
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">VT</span>
                    <input
                      type="number"
                      value={form.original_price}
                      onChange={(e) => setForm(prev => ({ ...prev, original_price: Number(e.target.value) }))}
                      className={`w-full pl-12 pr-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors ${
                        isFieldChanged('original_price') ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200'
                      }`}
                      min={0}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5 text-gray-400" />
                    Deal Price (VT)
                    {isFieldChanged('deal_price') && (
                      <span className="flex items-center gap-1 text-[10px] text-orange-500 font-semibold bg-orange-50 px-1.5 py-0.5 rounded">
                        <Edit3 className="w-2.5 h-2.5" /> Modified
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">VT</span>
                    <input
                      type="number"
                      value={form.deal_price}
                      onChange={(e) => setForm(prev => ({ ...prev, deal_price: Number(e.target.value) }))}
                      className={`w-full pl-12 pr-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors ${
                        isFieldChanged('deal_price') ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200'
                      }`}
                      min={0}
                    />
                  </div>
                </div>
              </div>

              {/* Savings Preview */}
              {form.original_price > 0 && form.deal_price > 0 && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-emerald-800">
                        Tourists save VT {(form.original_price - form.deal_price).toLocaleString()} ({savingsPercent}% off)
                      </p>
                      <p className="text-xs text-emerald-600 mt-0.5">
                        <span className="line-through">VT {form.original_price.toLocaleString()}</span>
                        <span className="font-bold ml-2">VT {form.deal_price.toLocaleString()}</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {form.deal_price >= form.original_price && form.original_price > 0 && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-700">Deal price should be lower than the original price to show savings.</p>
                </div>
              )}
            </div>
          )}

          {/* Contact & Hours Section */}
          {activeSection === 'contact' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Phone className="w-5 h-5 text-teal-600" />
                  Contact & Hours
                </h3>
                {changedFields.some(f => ['phone', 'hours', 'whatsapp_number'].includes(f)) && (
                  <button
                    onClick={() => {
                      resetField('phone');
                      resetField('hours');
                      resetField('whatsapp_number');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Reset Section
                  </button>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  Phone Number
                  {isFieldChanged('phone') && (
                    <span className="flex items-center gap-1 text-[10px] text-orange-500 font-semibold bg-orange-50 px-1.5 py-0.5 rounded">
                      <Edit3 className="w-2.5 h-2.5" /> Modified
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors ${
                      isFieldChanged('phone') ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200'
                    }`}
                    placeholder="+678 12345"
                  />
                  {isFieldChanged('phone') && (
                    <button
                      onClick={() => resetField('phone')}
                      className="absolute top-1/2 -translate-y-1/2 right-2 p-1 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* ─── WhatsApp Number ─── */}
              <div className="p-5 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                      <WhatsAppIcon className="w-4.5 h-4.5 text-green-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-green-800 flex items-center gap-2">
                        WhatsApp Number
                        <span className="text-[10px] text-green-600 bg-green-100 px-1.5 py-0.5 rounded font-medium">Optional</span>
                        {isFieldChanged('whatsapp_number') && (
                          <span className="flex items-center gap-1 text-[10px] text-orange-500 font-semibold bg-orange-50 px-1.5 py-0.5 rounded">
                            <Edit3 className="w-2.5 h-2.5" /> Modified
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-green-600">Let tourists message you directly on WhatsApp</p>
                    </div>
                  </div>
                  {isFieldChanged('whatsapp_number') && (
                    <button
                      onClick={() => resetField('whatsapp_number')}
                      className="p-1.5 rounded-lg bg-white border border-green-200 text-green-500 hover:text-green-700 hover:border-green-300 transition-colors"
                      title="Undo WhatsApp changes"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="relative">
                  <WhatsAppIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                  <input
                    type="tel"
                    value={form.whatsapp_number}
                    onChange={(e) => setForm(prev => ({ ...prev, whatsapp_number: e.target.value }))}
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-colors ${
                      isFieldChanged('whatsapp_number')
                        ? 'border-orange-300 bg-orange-50/30 focus:ring-orange-400'
                        : form.whatsapp_number && !whatsappValidation.valid
                          ? 'border-red-300 bg-red-50/30 focus:ring-red-400'
                          : form.whatsapp_number && whatsappValidation.valid
                            ? 'border-green-300 bg-white focus:ring-green-500'
                            : 'border-green-200 bg-white focus:ring-green-500'
                    }`}
                    placeholder="+678 5551234"
                  />
                </div>

                {/* Real-time validation feedback */}
                {form.whatsapp_number.trim() !== '' && (
                  <div className={`flex items-center gap-1.5 mt-2 ${whatsappValidation.valid ? 'text-green-600' : 'text-red-500'}`}>
                    {whatsappValidation.valid ? (
                      <CheckCircle className="w-3.5 h-3.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5" />
                    )}
                    <span className="text-[11px] font-medium">{whatsappValidation.message}</span>
                  </div>
                )}

                {/* Country code guidance */}
                <div className="mt-3 p-3 rounded-lg bg-white/70 border border-green-100">
                  <p className="text-[11px] text-green-700 font-medium mb-1.5 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Country Code Guide
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { code: '+678', country: 'Vanuatu' },
                      { code: '+61', country: 'Australia' },
                      { code: '+64', country: 'New Zealand' },
                      { code: '+33', country: 'France' },
                      { code: '+1', country: 'USA/Canada' },
                    ].map(({ code, country }) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => {
                          if (!form.whatsapp_number.startsWith('+')) {
                            setForm(prev => ({ ...prev, whatsapp_number: code + ' ' + prev.whatsapp_number }));
                          }
                        }}
                        className="px-2 py-1 rounded-md bg-green-50 border border-green-200 text-[10px] font-medium text-green-700 hover:bg-green-100 transition-colors"
                      >
                        {code} {country}
                      </button>
                    ))}
                  </div>
                </div>

                {/* WhatsApp benefits tooltip */}
                <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-green-100/50 border border-green-200/50">
                  <MessageCircle className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[11px] text-green-700 font-medium">Why add WhatsApp?</p>
                    <p className="text-[10px] text-green-600 mt-0.5">
                      Tourists prefer WhatsApp for quick questions about bookings, availability, and directions. 
                      Businesses with WhatsApp get up to 3x more enquiries. Your number will be displayed publicly on your listing.
                    </p>
                  </div>
                </div>

                {/* Current WhatsApp status */}
                {original.whatsapp_number && (
                  <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-white border border-green-200">
                    <WhatsAppIcon className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-[11px] text-gray-600">
                      Current: <span className="font-semibold text-green-700">{original.whatsapp_number}</span>
                    </span>
                    {form.whatsapp_number.trim() === '' && original.whatsapp_number && (
                      <span className="ml-auto px-2 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-bold">
                        Will be removed
                      </span>
                    )}
                  </div>
                )}

                {/* Remove WhatsApp button (only show if currently has a number) */}
                {(form.whatsapp_number || original.whatsapp_number) && form.whatsapp_number.trim() !== '' && (
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, whatsapp_number: '' }))}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Remove WhatsApp Number
                  </button>
                )}
              </div>

              {/* Hours */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  Operating Hours
                  {isFieldChanged('hours') && (
                    <span className="flex items-center gap-1 text-[10px] text-orange-500 font-semibold bg-orange-50 px-1.5 py-0.5 rounded">
                      <Edit3 className="w-2.5 h-2.5" /> Modified
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.hours}
                    onChange={(e) => setForm(prev => ({ ...prev, hours: e.target.value }))}
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors ${
                      isFieldChanged('hours') ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200'
                    }`}
                    placeholder="e.g. 9:00 AM - 5:00 PM"
                  />
                  {isFieldChanged('hours') && (
                    <button
                      onClick={() => resetField('hours')}
                      className="absolute top-1/2 -translate-y-1/2 right-2 p-1 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Use a clear format tourists can understand</p>
              </div>

              {/* Listing Status */}
              <div className="p-5 rounded-xl bg-gray-50 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? 'bg-emerald-100' : 'bg-gray-200'}`}>
                      <Power className={`w-5 h-5 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Listing Status</p>
                      <p className="text-xs text-gray-500">
                        {isActive ? 'Your listing is visible to tourists' : 'Your listing is hidden from tourists'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(true)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      Active
                    </button>
                    <button
                      onClick={() => handleToggle(false)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        !isActive
                          ? 'bg-red-500 text-white shadow-lg shadow-red-200'
                          : 'bg-red-50 text-red-600 hover:bg-red-100'
                      }`}
                    >
                      Inactive
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-3 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Status changes take effect immediately without admin approval.
                </p>
              </div>
            </div>
          )}

          {/* Preview Section */}
          {activeSection === 'media' && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Eye className="w-5 h-5 text-teal-600" />
                Listing Preview
              </h3>
              <p className="text-sm text-gray-500 -mt-4">This is how your listing will appear to tourists after changes are approved.</p>

              {/* Card Preview */}
              <div className="max-w-md mx-auto">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                  <div className="relative">
                    <img
                      src={selectedBusiness.image}
                      alt={selectedBusiness.name}
                      className="w-full h-48 object-cover"
                    />
                    <div className="absolute top-3 left-3">
                      <span className="px-2.5 py-1 rounded-lg bg-orange-500 text-white text-xs font-bold shadow-lg">
                        {form.discount || selectedBusiness.discount}
                      </span>
                    </div>
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      {/* WhatsApp badge in preview */}
                      {form.whatsapp_number && whatsappValidation.valid && (
                        <span className="px-2 py-1 rounded-lg bg-green-500 text-white text-xs font-bold flex items-center gap-1 shadow-lg">
                          <WhatsAppIcon className="w-3 h-3 text-white" />
                        </span>
                      )}
                      <span className="px-2 py-1 rounded-lg bg-white/90 backdrop-blur-sm text-xs font-bold text-gray-700 flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        {selectedBusiness.rating}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-gray-900">{selectedBusiness.name}</h4>
                      {form.whatsapp_number && whatsappValidation.valid && (
                        <WhatsAppIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {form.location || selectedBusiness.location}
                    </p>
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                      {plainTextFromHtml(form.description || selectedBusiness.description || '')}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-sm line-through text-gray-400">
                        VT {(form.original_price || selectedBusiness.originalPrice).toLocaleString()}
                      </span>
                      <span className="text-lg font-extrabold text-teal-600">
                        VT {(form.deal_price || selectedBusiness.dealPrice).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {(form.tags.length > 0 ? form.tags : selectedBusiness.tags).slice(0, 3).map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-md bg-gray-100 text-[10px] text-gray-600 font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {form.hours || selectedBusiness.hours}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {form.phone || selectedBusiness.phone}
                      </span>
                      {form.whatsapp_number && whatsappValidation.valid && (
                        <span className="flex items-center gap-1 text-green-600 font-medium">
                          <WhatsAppIcon className="w-3 h-3 text-green-500" />
                          WhatsApp
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Changes highlighted */}
              {hasChanges && (
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <p className="text-xs font-bold text-blue-800 flex items-center gap-1.5 mb-2">
                    <Info className="w-3.5 h-3.5" />
                    Changes in this preview
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {changedFields.map(field => (
                      <span key={field} className={`px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize ${
                        field === 'whatsapp_number'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {field.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Changes Summary & Submit */}
      {hasChanges && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-orange-500" />
              Changes Summary
              <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 text-xs font-bold">
                {changedFields.length} field{changedFields.length > 1 ? 's' : ''}
              </span>
            </h3>
            <button
              onClick={resetAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Discard All
            </button>
          </div>

          <div className="space-y-2">
            {changedFields.map(field => {
              const oldVal = (original as any)[field];
              const newVal = (form as any)[field];
              const isArray = Array.isArray(newVal);
              const isWhatsApp = field === 'whatsapp_number';
              return (
                <div key={field} className={`flex items-start gap-3 p-3 rounded-xl border ${
                  isWhatsApp
                    ? 'bg-green-50/50 border-green-100'
                    : 'bg-orange-50/50 border-orange-100'
                }`}>
                  {isWhatsApp ? (
                    <WhatsAppIcon className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold capitalize ${isWhatsApp ? 'text-green-800' : 'text-orange-800'}`}>
                      {field.replace(/_/g, ' ')}
                    </p>
                    {isWhatsApp ? (
                      <p className="text-[11px] text-green-600 mt-0.5">
                        {oldVal ? `"${oldVal}"` : '(none)'} → {newVal ? `"${newVal}"` : '(removed)'}
                      </p>
                    ) : isArray ? (
                      <p className="text-[11px] text-orange-600 mt-0.5">
                        {(oldVal as string[]).join(', ')} → {(newVal as string[]).join(', ')}
                      </p>
                    ) : typeof newVal === 'number' ? (
                      <p className="text-[11px] text-orange-600 mt-0.5">
                        VT {Number(oldVal).toLocaleString()} → VT {Number(newVal).toLocaleString()}
                      </p>
                    ) : (
                      <p className="text-[11px] text-orange-600 mt-0.5 line-clamp-1">
                        "{String(oldVal).substring(0, 50)}{String(oldVal).length > 50 ? '...' : ''}" → "{String(newVal).substring(0, 50)}{String(newVal).length > 50 ? '...' : ''}"
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => resetField(field as keyof EditFormData)}
                    className={`p-1 rounded-lg transition-colors flex-shrink-0 ${
                      isWhatsApp
                        ? 'text-green-400 hover:text-red-500 hover:bg-green-100'
                        : 'text-orange-400 hover:text-red-500 hover:bg-orange-100'
                    }`}
                    title={`Undo ${field}`}
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* WhatsApp validation warning in submit area */}
          {changedFields.includes('whatsapp_number') && form.whatsapp_number.trim() !== '' && !whatsappValidation.valid && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700">
                Please fix the WhatsApp number before submitting: {whatsappValidation.message}
              </p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || (changedFields.includes('whatsapp_number') && form.whatsapp_number.trim() !== '' && !whatsappValidation.valid)}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold hover:from-teal-700 hover:to-emerald-700 shadow-lg shadow-teal-200 flex items-center justify-center gap-2 transition-all disabled:opacity-60"
          >
            {submitting ? (
              <><Loader2 className="w-5 h-5 animate-spin" />Submitting...</>
            ) : (
              <><ShieldCheck className="w-5 h-5" />{currentPendingEdit ? 'Update Pending Edit' : 'Submit Changes for Review'}</>
            )}
          </button>
        </div>
      )}

      {/* No Changes State */}
      {!hasChanges && activeSection !== 'media' && (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-600">No changes made yet</p>
          <p className="text-xs text-gray-400 mt-1">Edit the fields above and your changes will appear here for review.</p>
        </div>
      )}

      {/* Edit History */}
      {/* Danger zone — delete listing (owner only) */}
      {isOwner && (
        <div className="bg-red-50/80 rounded-2xl border border-red-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-red-900 flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Delete listing
              </h3>
              <p className="text-xs text-red-800/90 mt-1 max-w-xl">
                Permanently remove this listing from StikmNek, including gallery photos. Reviews and favorites linked to
                this listing will be removed. This cannot be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              className="shrink-0 px-4 py-2.5 rounded-xl border-2 border-red-300 bg-white text-red-700 text-sm font-bold hover:bg-red-100 transition-colors"
            >
              Delete listing…
            </button>
          </div>
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{selectedBusiness.name}”?</AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              <span className="block">
                This will permanently delete your listing and its photos. Related reviews and saved favorites for this
                listing will also be removed. This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Deleting…
                </>
              ) : (
                'Yes, delete listing'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editHistory.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <History className="w-5 h-5 text-gray-500" />
              Edit History
            </h3>
            <button
              onClick={loadPendingEdits}
              disabled={loadingEdits}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 text-gray-500 text-xs font-medium hover:bg-gray-100 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${loadingEdits ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {editHistory.map(edit => (
              <div key={edit.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      edit.status === 'pending' ? 'bg-yellow-50' : edit.status === 'approved' ? 'bg-green-50' : 'bg-red-50'
                    }`}>
                      {edit.status === 'pending' ? <Clock className="w-4 h-4 text-yellow-500" /> :
                       edit.status === 'approved' ? <CheckCircle className="w-4 h-4 text-green-500" /> :
                       <XCircle className="w-4 h-4 text-red-500" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 capitalize">Edit {edit.status}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(edit.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize ${
                    edit.status === 'pending' ? 'bg-yellow-50 text-yellow-700' :
                    edit.status === 'approved' ? 'bg-green-50 text-green-700' :
                    'bg-red-50 text-red-700'
                  }`}>
                    {edit.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {Object.keys(edit.changes).map(key => (
                    <span key={key} className={`px-2 py-0.5 rounded-md text-xs font-semibold capitalize ${
                      key === 'whatsapp_number'
                        ? 'bg-green-50 text-green-600'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {key === 'whatsapp_number' && <WhatsAppIcon className="w-2.5 h-2.5 inline mr-1" />}
                      {key.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
                {edit.admin_notes && edit.status !== 'pending' && (
                  <div className={`mt-2 p-3 rounded-lg text-xs ${
                    edit.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                    <span className="font-bold">Admin Note:</span> {edit.admin_notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EditListingPanel;
