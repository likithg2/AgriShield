import React, { useEffect } from 'react';
import { X, ZoomIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ImageModal({ isOpen, onClose, imageSrc }) {
  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && imageSrc && (
        <motion.div
          key="image-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-x-0 bottom-0 top-[88px] z-40 flex items-center justify-center p-6"
          onClick={onClose}
          style={{
            background: `
              radial-gradient(ellipse 80% 60% at 20% 30%, rgba(16,185,129,0.25) 0%, transparent 60%),
              radial-gradient(ellipse 70% 50% at 80% 70%, rgba(59,130,246,0.2) 0%, transparent 55%),
              radial-gradient(ellipse 50% 40% at 50% 10%, rgba(168,85,247,0.12) 0%, transparent 50%),
              radial-gradient(ellipse at center, rgba(2,44,34,0.7) 0%, rgba(0,0,0,0.88) 100%)
            `,
            backdropFilter: 'blur(30px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(30px) saturate(1.4)',
          }}
        >
          {/* Floating ambient light orbs */}
          <motion.div
            className="absolute pointer-events-none"
            style={{
              width: '400px', height: '400px', top: '5%', left: '10%',
              background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)',
              borderRadius: '50%', filter: 'blur(60px)',
            }}
            animate={{ x: [0, 30, -20, 0], y: [0, -20, 15, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute pointer-events-none"
            style={{
              width: '350px', height: '350px', bottom: '10%', right: '5%',
              background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
              borderRadius: '50%', filter: 'blur(50px)',
            }}
            animate={{ x: [0, -25, 15, 0], y: [0, 20, -10, 0] }}
            transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Glass frame around the image */}
          <motion.div
            key="image-modal-content"
            initial={{ opacity: 0, scale: 0.82, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 25 }}
            transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative max-w-5xl max-h-[88vh] w-auto"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.12) 100%)',
              borderRadius: '28px',
              border: '1px solid rgba(255,255,255,0.25)',
              boxShadow: `
                0 40px 100px rgba(0,0,0,0.5),
                0 8px 32px rgba(0,0,0,0.3),
                inset 0 1px 0 rgba(255,255,255,0.2),
                inset 0 -1px 0 rgba(255,255,255,0.05)
              `,
              backdropFilter: 'blur(40px) saturate(1.6)',
              WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
              padding: '14px',
            }}
          >
            {/* Top shimmer highlight */}
            <div
              className="absolute top-0 left-[10%] right-[10%] h-[1px] pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
              }}
            />

            {/* Close button */}
            <motion.button
              whileHover={{ scale: 1.15, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="absolute -top-3 -right-3 p-2.5 rounded-full z-10"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.08))',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.25)',
                color: '#fff',
                boxShadow: '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              <X size={20} />
            </motion.button>

            {/* Image */}
            <img
              src={imageSrc}
              alt="Full screen view"
              className="block max-h-[80vh] max-w-full object-contain"
              style={{
                borderRadius: '18px',
                boxShadow: '0 12px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)',
              }}
            />

            {/* Bottom label */}
            <div className="flex items-center justify-center gap-2 mt-3 text-white/40 text-xs font-medium tracking-wider uppercase">
              <ZoomIn size={13} />
              <span>Click outside or press Esc to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
