import React, { useState, useContext, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Edit2, Trash2, Check, KeyRound, Eye, EyeOff, User } from 'lucide-react';
import Button from './Button';
import GlassCard from './GlassCard';
import { AuthContext } from '../context/AuthContext';
import { authAPI } from '../utils/api';
import toast from 'react-hot-toast';
import { useResendTimer } from '../hooks/useResendTimer';

const DISTRICT_OPTIONS = [
  "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban",
  "Bidar", "Chamarajanagar", "Chikkaballapur", "Chitradurga", "Dakshina Kannada",
  "Davangere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu",
  "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga",
  "Tumakuru", "Udupi", "Uttara Kannada", "Vijayanagar", "Vijayapura", "Yadgir"
];

const EditProfileModal = ({ isOpen, onClose }) => {
  const { user, login, logout } = useContext(AuthContext);

  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    district: '',
    email: '',
  });

  const [updateMsg, setUpdateMsg] = useState({ type: '', text: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Email OTP States
  const [showEmailOTP, setShowEmailOTP] = useState(false);
  const [emailOTP, setEmailOTP] = useState('');
  const [showEmailOtpPassword, setShowEmailOtpPassword] = useState(false);
  const { isTimerActive, startTimer, formattedTime } = useResendTimer(120);

  useEffect(() => {
    if (user) {
      setEditForm({
        full_name: user.full_name || '',
        phone: user.phone || '',
        district: user.district || '',
        email: user.email || '',
      });
      setUpdateMsg({ type: '', text: '' });
      setShowEmailOTP(false);
      setEmailOTP('');
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setUpdateMsg({ type: '', text: '' });

    // Validate phone number
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(editForm.phone)) {
      setUpdateMsg({ type: 'error', text: 'Phone number must be a valid 10-digit Indian number starting with 6, 7, 8, or 9.' });
      return;
    }

    // Check if email has changed
    if (editForm.email.toLowerCase() !== user.email.toLowerCase()) {
      try {
        setSubmitting(true);
        await authAPI.requestEmailOTP(editForm.email);
        setShowEmailOTP(true);
        startTimer();
        toast.success(`OTP sent to ${editForm.email}`);
      } catch (err) {
        setUpdateMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to send OTP to new email address.' });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Otherwise just update profile
    await executeProfileUpdate();
  };

  const executeProfileUpdate = async () => {
    try {
      setSubmitting(true);
      const res = await authAPI.updateProfile(editForm);
      const token = localStorage.getItem('auth_token');
      login(token, res.data);
      toast.success('Profile updated successfully!');
      onClose();
    } catch (err) {
      setUpdateMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to update profile.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyEmailOTP = async (e) => {
    e.preventDefault();
    setUpdateMsg({ type: '', text: '' });
    try {
      setSubmitting(true);
      await authAPI.verifyEmailOTP(editForm.email, emailOTP);
      await executeProfileUpdate();
      setShowEmailOTP(false);
      setEmailOTP('');
    } catch (err) {
      setUpdateMsg({ type: 'error', text: err.response?.data?.detail || 'Invalid or expired OTP.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendEmailOTP = async () => {
    if (isTimerActive) return;
    try {
      await authAPI.requestEmailOTP(editForm.email);
      startTimer();
      toast.success("OTP resent successfully!");
    } catch (err) {
      setUpdateMsg({ type: 'error', text: 'Failed to resend OTP.' });
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await authAPI.deleteAccount();
      logout();
      toast.success("Account deleted successfully");
    } catch (err) {
      toast.error("Failed to delete account. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", duration: 0.4 }}
        className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-3xl max-w-lg w-full shadow-2xl border border-glass-border flex flex-col overflow-hidden max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-glass-border flex justify-between items-center bg-gray-50/80 dark:bg-black/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
              <User size={18} />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white">Edit Profile</h3>
              <p className="text-xs text-text-muted">Manage your personal account details</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-text-muted hover:text-danger hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {updateMsg.text && (
            <div className={`p-3 rounded-xl text-sm ${updateMsg.type === 'error' ? 'bg-danger/10 text-danger border border-danger/20' : 'bg-success/10 text-success border border-success/20'}`}>
              {updateMsg.text}
            </div>
          )}

          {!showEmailOTP ? (
            <form onSubmit={handleProfileUpdate} className="space-y-4">
              <div>
                <label htmlFor="edit-name" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  id="edit-name"
                  type="text"
                  className="input-field"
                  value={editForm.full_name}
                  onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label htmlFor="edit-phone" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  id="edit-phone"
                  type="text"
                  className="input-field"
                  value={editForm.phone}
                  onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                  required
                />
              </div>

              <div>
                <label htmlFor="edit-email" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  id="edit-email"
                  type="email"
                  className="input-field"
                  value={editForm.email}
                  onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                  required
                />
              </div>

              {user?.role === 'farmer' && (
                <div>
                  <label htmlFor="edit-district" className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                    District
                  </label>
                  <select
                    id="edit-district"
                    value={editForm.district}
                    onChange={e => setEditForm({ ...editForm, district: e.target.value })}
                    className="input-field bg-white text-gray-900 border border-gray-300 dark:bg-black/90 dark:text-white dark:border-white/10"
                    required
                  >
                    <option value="">Select District</option>
                    {DISTRICT_OPTIONS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-4 border-t border-glass-border flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowDeleteModal(true)}
                  className="bg-red-50 dark:bg-red-900/20 text-danger hover:bg-red-100 dark:hover:bg-red-900/40 border-red-200 dark:border-red-800 text-xs py-2 px-3 justify-center"
                  icon={Trash2}
                >
                  Delete Account
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={onClose} className="flex-1 sm:flex-initial justify-center">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting} icon={Check} className="flex-1 sm:flex-initial justify-center">
                    {submitting ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyEmailOTP} className="space-y-4">
              <div className="p-4 bg-warning/10 text-warning rounded-xl text-sm border border-warning/20">
                You are changing your email. An OTP has been sent to <strong>{editForm.email}</strong>.
              </div>
              <div className="space-y-2">
                <label htmlFor="otp-input" className="text-sm font-medium">Enter 6-Digit OTP</label>
                <div className="relative">
                  {!emailOTP && (
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                      <KeyRound size={18} />
                    </div>
                  )}
                  <input
                    id="otp-input"
                    type={showEmailOtpPassword ? "text" : "password"}
                    value={emailOTP}
                    onChange={(e) => setEmailOTP(e.target.value)}
                    className={`input-field ${emailOTP ? 'pl-4' : 'pl-10'} pr-10 bg-primary/10 tracking-widest text-center text-lg font-bold`}
                    maxLength="6"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmailOtpPassword(!showEmailOtpPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
                  >
                    {showEmailOtpPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={handleResendEmailOTP}
                  disabled={isTimerActive}
                  className="text-xs text-primary disabled:opacity-50 disabled:cursor-not-allowed font-semibold hover:underline"
                >
                  {isTimerActive ? `Resend OTP in ${formattedTime()}` : 'Resend OTP'}
                </button>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button type="button" variant="secondary" onClick={() => setShowEmailOTP(false)} className="flex-1 sm:flex-initial justify-center">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting} className="flex-1 sm:flex-initial justify-center">
                    {submitting ? 'Verifying...' : 'Verify & Save'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Delete Account Modal Confirmation */}
        <AnimatePresence>
          {showDeleteModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-gray-900 p-6 rounded-3xl max-w-sm w-full shadow-2xl space-y-4 border border-glass-border text-center"
              >
                <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 text-danger flex items-center justify-center mx-auto">
                  <Trash2 size={28} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Delete Account?</h3>
                <p className="text-xs text-text-muted">
                  Are you sure you want to permanently delete your account? This action cannot be undone.
                </p>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={() => setShowDeleteModal(false)}>
                    Cancel
                  </Button>
                  <Button type="button" className="flex-1 justify-center bg-danger hover:bg-red-600 text-white border-0" onClick={handleDeleteAccount}>
                    Yes, Delete
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default EditProfileModal;
