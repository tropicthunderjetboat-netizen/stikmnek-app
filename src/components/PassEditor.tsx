import React, { useState } from 'react';
import { usePassConfig, PassConfig, PassFeature } from '@/hooks/usePassConfig';
import { useAppContext } from '@/contexts/AppContext';
import { toast } from 'sonner';
import {
  Zap, Star, Crown, Check, CreditCard, DollarSign, Trash2,
  Plus, Eye, EyeOff, ChevronDown,
  RotateCcw, Save, Palette, Globe, Hash, Sparkles, Users, Baby,
  ArrowUp, ArrowDown, Settings2, ToggleLeft, ToggleRight, Calendar,
  Share2, Gift
} from 'lucide-react';

const ICON_OPTIONS: { value: PassConfig['icon']; label: string; icon: React.ReactNode }[] = [
  { value: 'zap', label: 'Lightning', icon: <Zap className="w-4 h-4" /> },
  { value: 'star', label: 'Star', icon: <Star className="w-4 h-4" /> },
  { value: 'crown', label: 'Crown', icon: <Crown className="w-4 h-4" /> },
];

const COLOR_PRESETS = [
  { from: 'sky-500', to: 'blue-600', shadow: 'sky-200', label: 'Ocean Blue' },
  { from: 'teal-500', to: 'emerald-600', shadow: 'teal-200', label: 'Tropical Teal' },
  { from: 'orange-500', to: 'amber-600', shadow: 'orange-200', label: 'Sunset Orange' },
  { from: 'violet-500', to: 'purple-600', shadow: 'violet-200', label: 'Royal Purple' },
  { from: 'rose-500', to: 'pink-600', shadow: 'rose-200', label: 'Island Rose' },
  { from: 'emerald-500', to: 'green-600', shadow: 'emerald-200', label: 'Forest Green' },
  { from: 'amber-500', to: 'yellow-600', shadow: 'amber-200', label: 'Golden' },
  { from: 'cyan-500', to: 'teal-600', shadow: 'cyan-200', label: 'Lagoon' },
];

const getIconComponent = (icon: PassConfig['icon'], className = 'w-6 h-6') => {
  switch (icon) {
    case 'zap': return <Zap className={className} />;
    case 'star': return <Star className={className} />;
    case 'crown': return <Crown className={className} />;
    default: return <Zap className={className} />;
  }
};

const PassEditor: React.FC = () => {
  const { language } = useAppContext();
  const {
    passes, updatePass, updatePassFeature, updateShareBonus, addFeature,
    removeFeature, resetToDefaults,
  } = usePassConfig();

  const [expandedPass, setExpandedPass] = useState<string | null>(null);
  const [activeLanguageTab, setActiveLanguageTab] = useState<'en' | 'fr' | 'bi'>('en');
  const [showPreview, setShowPreview] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleReset = () => {
    resetToDefaults();
    setConfirmReset(false);
    toast.success('Pass configurations reset to defaults');
  };

  const handleMoveUp = (pass: PassConfig) => {
    const idx = passes.findIndex(p => p.id === pass.id);
    if (idx <= 0) return;
    const prev = passes[idx - 1];
    updatePass(pass.id, { sortOrder: prev.sortOrder });
    updatePass(prev.id, { sortOrder: pass.sortOrder });
  };

  const handleMoveDown = (pass: PassConfig) => {
    const idx = passes.findIndex(p => p.id === pass.id);
    if (idx >= passes.length - 1) return;
    const next = passes[idx + 1];
    updatePass(pass.id, { sortOrder: next.sortOrder });
    updatePass(next.id, { sortOrder: pass.sortOrder });
  };

  const sortedPasses = [...passes].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-teal-600" />
            Pass Configuration
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Edit pricing, group sizes, share bonuses, and appearance of tourist passes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
              showPreview
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Eye className="w-4 h-4" />
            {showPreview ? 'Hide Preview' : 'Live Preview'}
          </button>
          {confirmReset ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Confirm Reset
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Defaults
            </button>
          )}
        </div>
      </div>

      {/* Live Preview */}
      {showPreview && (
        <div className="bg-gradient-to-b from-teal-50/50 to-white rounded-2xl border border-teal-100 p-6">
          <p className="text-xs font-bold text-teal-600 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Live Preview — How tourists will see the passes
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {sortedPasses.filter(p => p.active).map(pass => {
              const passName = activeLanguageTab === 'fr' ? pass.nameFr : activeLanguageTab === 'bi' ? pass.nameBi : pass.name;
              const passPeriod = activeLanguageTab === 'fr' ? pass.periodFr : activeLanguageTab === 'bi' ? pass.periodBi : pass.period;
              const groupLabel = pass.totalPeople
                ? `${pass.totalPeople} people`
                : `${pass.adults} adults & ${pass.kids} kids`;
              return (
                <div
                  key={pass.id}
                  className="relative bg-white rounded-xl overflow-hidden transition-all duration-300 border border-gray-200 shadow-sm"
                >
                  <div className="p-5">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-${pass.colorFrom} to-${pass.colorTo} flex items-center justify-center text-white mb-3 shadow-md`}>
                      {getIconComponent(pass.icon, 'w-5 h-5')}
                    </div>
                    <h4 className="text-sm font-bold text-gray-900 mb-1">{passName}</h4>
                    <div className="flex flex-wrap gap-1 mb-2">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-semibold">
                        <Users className="w-2.5 h-2.5" />{groupLabel}
                      </span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-semibold">
                        <Calendar className="w-2.5 h-2.5" />{pass.baseDays} days
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1 mb-3">
                      <span className="text-2xl font-extrabold text-gray-900">${pass.price}</span>
                      <span className="text-gray-400 text-xs">{passPeriod}</span>
                    </div>
                    {(pass.shareBonus.extraDays > 0 || pass.shareBonus.extraPeople > 0 || pass.shareBonus.extraKids > 0) && (
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 mb-3">
                        <p className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                          <Share2 className="w-3 h-3" /> Share to unlock:
                          {pass.shareBonus.extraDays > 0 && ` +${pass.shareBonus.extraDays} day`}
                          {pass.shareBonus.extraPeople > 0 && ` +${pass.shareBonus.extraPeople} people`}
                          {pass.shareBonus.extraKids > 0 && ` +${pass.shareBonus.extraKids} kids`}
                        </p>
                      </div>
                    )}
                    <ul className="space-y-1.5 mb-4">
                      {pass.features.slice(0, 4).map(f => {
                        const featureText = activeLanguageTab === 'fr' ? f.textFr : activeLanguageTab === 'bi' ? f.textBi : f.text;
                        return (
                          <li key={f.id} className="flex items-center gap-2 text-xs text-gray-600">
                            <div className={`w-4 h-4 rounded-full bg-gradient-to-br from-${pass.colorFrom} to-${pass.colorTo} flex items-center justify-center flex-shrink-0`}>
                              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                            </div>
                            {featureText}
                          </li>
                        );
                      })}
                      {pass.features.length > 4 && (
                        <li className="text-[10px] text-gray-400 pl-6">+{pass.features.length - 4} more features</li>
                      )}
                    </ul>
                    <div className="w-full py-2 rounded-lg text-xs font-bold text-center bg-gray-100 text-gray-600">
                      Buy Now
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Language toggle for preview */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <span className="text-xs text-gray-400">Preview language:</span>
            {(['en', 'fr', 'bi'] as const).map(lang => (
              <button
                key={lang}
                onClick={() => setActiveLanguageTab(lang)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeLanguageTab === lang
                    ? 'bg-teal-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {lang === 'en' ? 'English' : lang === 'fr' ? 'Français' : 'Bislama'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pass Cards Editor */}
      <div className="space-y-4">
        {sortedPasses.map((pass, idx) => {
          const isExpanded = expandedPass === pass.id;
          return (
            <div
              key={pass.id}
              className={`bg-white rounded-xl border overflow-hidden transition-all duration-200 ${
                isExpanded ? 'shadow-lg border-teal-200' : 'shadow-sm border-gray-100 hover:border-gray-200'
              } ${!pass.active ? 'opacity-60' : ''}`}
            >
              {/* Collapsed Header */}
              <div
                className="flex items-center gap-4 p-4 cursor-pointer"
                onClick={() => setExpandedPass(isExpanded ? null : pass.id)}
              >
                {/* Reorder + Icon */}
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMoveUp(pass); }}
                      disabled={idx === 0}
                      className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 transition-colors"
                    >
                      <ArrowUp className="w-3 h-3 text-gray-400" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMoveDown(pass); }}
                      disabled={idx === sortedPasses.length - 1}
                      className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 transition-colors"
                    >
                      <ArrowDown className="w-3 h-3 text-gray-400" />
                    </button>
                  </div>
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br from-${pass.colorFrom} to-${pass.colorTo} flex items-center justify-center text-white shadow-md`}>
                    {getIconComponent(pass.icon, 'w-5 h-5')}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-gray-900">{pass.name}</h4>
                    {!pass.active && (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold uppercase">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    ${pass.price}{pass.period} · {pass.totalPeople ? `${pass.totalPeople} people` : `${pass.adults}A + ${pass.kids}K`} · {pass.baseDays}d base · {pass.features.length} features
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => updatePass(pass.id, { active: !pass.active })}
                    className={`p-2 rounded-lg transition-colors ${
                      pass.active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={pass.active ? 'Deactivate pass' : 'Activate pass'}
                  >
                    {pass.active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                </div>

                {/* Expand/Collapse */}
                <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </div>
              </div>

              {/* Expanded Editor */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-6 space-y-6 bg-gray-50/50">
                  {/* ── Basic Info ── */}
                  <div>
                    <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Settings2 className="w-3.5 h-3.5" />
                      Basic Information
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                          <DollarSign className="w-3 h-3 inline mr-0.5" />
                          Price (AUD)

                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={pass.price}
                          onChange={e => updatePass(pass.id, { price: Number(e.target.value) || 0 })}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                          <Hash className="w-3 h-3 inline mr-0.5" />
                          Max Redemptions/Day
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={pass.maxRedemptionsPerDay}
                          onChange={e => updatePass(pass.id, { maxRedemptionsPerDay: Number(e.target.value) || 1 })}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                          <Sparkles className="w-3 h-3 inline mr-0.5" />
                          Icon
                        </label>
                        <div className="flex items-center gap-2">
                          {ICON_OPTIONS.map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => updatePass(pass.id, { icon: opt.value })}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                                pass.icon === opt.value
                                  ? 'bg-teal-50 border-teal-300 text-teal-700'
                                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                              }`}
                            >
                              {opt.icon}
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Group Structure ── */}
                  <div>
                    <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      Group Structure & Duration
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Adults</label>
                        <input
                          type="number"
                          min="0"
                          value={pass.adults}
                          onChange={e => updatePass(pass.id, { adults: Number(e.target.value) || 0 })}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Kids</label>
                        <input
                          type="number"
                          min="0"
                          value={pass.kids}
                          onChange={e => updatePass(pass.id, { kids: Number(e.target.value) || 0 })}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                          Total People
                          <span className="text-[10px] text-gray-400 ml-1">(0 = use A+K)</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={pass.totalPeople || 0}
                          onChange={e => {
                            const val = Number(e.target.value) || 0;
                            updatePass(pass.id, { totalPeople: val > 0 ? val : null });
                          }}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Base Days</label>
                        <input
                          type="number"
                          min="1"
                          value={pass.baseDays}
                          onChange={e => updatePass(pass.id, { baseDays: Number(e.target.value) || 1 })}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Full Days (w/ bonus)</label>
                        <input
                          type="number"
                          min="1"
                          value={pass.fullDays}
                          onChange={e => updatePass(pass.id, { fullDays: Number(e.target.value) || 1 })}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Share Bonus ── */}
                  <div>
                    <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Share2 className="w-3.5 h-3.5" />
                      Share App Bonus
                    </h5>
                    <div className="bg-amber-50/50 rounded-xl border border-amber-200 p-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">
                            <Calendar className="w-3 h-3 inline mr-0.5" />
                            Extra Days
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={pass.shareBonus.extraDays}
                            onChange={e => updateShareBonus(pass.id, { extraDays: Number(e.target.value) || 0 })}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">
                            <Users className="w-3 h-3 inline mr-0.5" />
                            Extra People
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={pass.shareBonus.extraPeople}
                            onChange={e => updateShareBonus(pass.id, { extraPeople: Number(e.target.value) || 0 })}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">
                            <Baby className="w-3 h-3 inline mr-0.5" />
                            Extra Kids
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={pass.shareBonus.extraKids}
                            onChange={e => updateShareBonus(pass.id, { extraKids: Number(e.target.value) || 0 })}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Bonus Description (EN)</label>
                          <input
                            type="text"
                            value={pass.shareBonus.description}
                            onChange={e => updateShareBonus(pass.id, { description: e.target.value })}
                            placeholder="Share the app to get..."
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Bonus Description (FR)</label>
                          <input
                            type="text"
                            value={pass.shareBonus.descriptionFr}
                            onChange={e => updateShareBonus(pass.id, { descriptionFr: e.target.value })}
                            placeholder="Partagez l'app pour..."
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Bonus Description (BI)</label>
                          <input
                            type="text"
                            value={pass.shareBonus.descriptionBi}
                            onChange={e => updateShareBonus(pass.id, { descriptionBi: e.target.value })}
                            placeholder="Serem app blong..."
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Multi-language Names ── */}
                  <div>
                    <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" />
                      Names & Periods (Multi-language)
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* English */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-5 h-3.5 rounded-sm bg-gradient-to-r from-blue-600 via-white to-red-600 border border-gray-200" />
                          <span className="text-[10px] font-bold text-gray-500 uppercase">English</span>
                        </div>
                        <input
                          type="text"
                          value={pass.name}
                          onChange={e => updatePass(pass.id, { name: e.target.value })}
                          placeholder="Pass name"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                        <input
                          type="text"
                          value={pass.period}
                          onChange={e => updatePass(pass.id, { period: e.target.value })}
                          placeholder="/day"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                        <input
                          type="text"
                          value={pass.description}
                          onChange={e => updatePass(pass.id, { description: e.target.value })}
                          placeholder="Short description"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                      </div>
                      {/* French */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-5 h-3.5 rounded-sm bg-gradient-to-r from-blue-700 via-white to-red-600 border border-gray-200" />
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Français</span>
                        </div>
                        <input
                          type="text"
                          value={pass.nameFr}
                          onChange={e => updatePass(pass.id, { nameFr: e.target.value })}
                          placeholder="Nom du pass"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                        <input
                          type="text"
                          value={pass.periodFr}
                          onChange={e => updatePass(pass.id, { periodFr: e.target.value })}
                          placeholder="/jour"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                        <input
                          type="text"
                          value={pass.descriptionFr}
                          onChange={e => updatePass(pass.id, { descriptionFr: e.target.value })}
                          placeholder="Description courte"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                      </div>
                      {/* Bislama */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-5 h-3.5 rounded-sm bg-gradient-to-r from-red-600 via-black to-green-600 border border-gray-200" />
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Bislama</span>
                        </div>
                        <input
                          type="text"
                          value={pass.nameBi}
                          onChange={e => updatePass(pass.id, { nameBi: e.target.value })}
                          placeholder="Nem blong pas"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                        <input
                          type="text"
                          value={pass.periodBi}
                          onChange={e => updatePass(pass.id, { periodBi: e.target.value })}
                          placeholder="/dei"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                        <input
                          type="text"
                          value={pass.descriptionBi}
                          onChange={e => updatePass(pass.id, { descriptionBi: e.target.value })}
                          placeholder="Smol deskripsen"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Color Theme ── */}
                  <div>
                    <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5" />
                      Color Theme
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {COLOR_PRESETS.map(preset => {
                        const isSelected = pass.colorFrom === preset.from && pass.colorTo === preset.to;
                        return (
                          <button
                            key={preset.label}
                            onClick={() => updatePass(pass.id, {
                              colorFrom: preset.from,
                              colorTo: preset.to,
                              shadowColor: preset.shadow,
                            })}
                            className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${
                              isSelected
                                ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-300'
                                : 'border-gray-200 bg-white hover:bg-gray-50'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br from-${preset.from} to-${preset.to} shadow-sm`} />
                            <span className={`text-xs font-medium ${isSelected ? 'text-teal-700' : 'text-gray-600'}`}>
                              {preset.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Features ── */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        Features ({pass.features.length})
                      </h5>
                      <button
                        onClick={() => addFeature(pass.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add Feature
                      </button>
                    </div>
                    <div className="space-y-2">
                      {pass.features.map((feature) => (
                        <div key={feature.id} className="flex items-start gap-2 p-3 rounded-xl bg-white border border-gray-200">
                          <div className={`w-5 h-5 rounded-full bg-gradient-to-br from-${pass.colorFrom} to-${pass.colorTo} flex items-center justify-center flex-shrink-0 mt-1.5`}>
                            <Check className="w-3 h-3 text-white" strokeWidth={3} />
                          </div>
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={feature.text}
                              onChange={e => updatePassFeature(pass.id, feature.id, { text: e.target.value })}
                              placeholder="English"
                              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                            <input
                              type="text"
                              value={feature.textFr}
                              onChange={e => updatePassFeature(pass.id, feature.id, { textFr: e.target.value })}
                              placeholder="Français"
                              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                            <input
                              type="text"
                              value={feature.textBi}
                              onChange={e => updatePassFeature(pass.id, feature.id, { textBi: e.target.value })}
                              placeholder="Bislama"
                              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </div>
                          <button
                            onClick={() => removeFeature(pass.id, feature.id)}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 mt-0.5"
                            title="Remove feature"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {pass.features.length === 0 && (
                        <div className="text-center py-4 text-xs text-gray-400">
                          No features yet. Click "Add Feature" to get started.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Save indicator */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <p className="text-xs text-gray-400 flex items-center gap-1.5">
                      <Save className="w-3 h-3" />
                      Changes are saved automatically
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updatePass(pass.id, { active: !pass.active })}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                          pass.active
                            ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                            : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        {pass.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        {pass.active ? 'Active — Visible to tourists' : 'Inactive — Hidden from tourists'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-gray-900">{passes.filter(p => p.active).length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Active Passes</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-teal-600">
            ${Math.min(...passes.filter(p => p.active).map(p => p.price))} — ${Math.max(...passes.filter(p => p.active).map(p => p.price))}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Price Range</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-orange-600">
            {passes.reduce((sum, p) => sum + p.features.length, 0)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Total Features</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-purple-600">
            {passes.reduce((max, p) => Math.max(max, p.totalPeople || (p.adults + p.kids)), 0)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Max Group Size</p>
        </div>
      </div>
    </div>
  );
};

export default PassEditor;
