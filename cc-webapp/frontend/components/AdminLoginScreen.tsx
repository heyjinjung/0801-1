'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { apiLogTry, apiLogSuccess, apiLogFail } from '../utils/apiLogger';
import { 
  Shield, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  Key,
  Crown,
  Zap
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/Label';

interface AdminLoginProps {
  onAdminLogin?: (adminId: string, password: string) => Promise<boolean>;
  onBackToLogin?: () => void;
  isLoading?: boolean;
}

export function AdminLoginScreen({ 
  onAdminLogin, 
  onBackToLogin,
  isLoading = false 
}: AdminLoginProps) {
  const [formData, setFormData] = useState({
    adminId: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockdownTime, setLockdownTime] = useState(0);

  // Security lockdown timer
  useEffect(() => {
    if (lockdownTime > 0) {
      const timer = setInterval(() => {
        setLockdownTime((prev: number) => {
          if (prev <= 1) {
            setIsLocked(false);
            setAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockdownTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    apiLogTry('POST /api/admin/login');
    if (isLocked) {
      setError(`보안 잠금 상태입니다. ${lockdownTime}초 후 다시 시도하세요.`);
      apiLogFail('POST /api/admin/login', '잠금 상태');
      return;
    }
    if (!formData.adminId.trim() || !formData.password.trim()) {
      setError('모든 필드를 입력해주세요.');
      apiLogFail('POST /api/admin/login', '필드 누락');
      return;
    }
    setIsSubmitting(true);
    try {
      const success = (await onAdminLogin?.(formData.adminId, formData.password)) ?? false;
      if (success) {
        apiLogSuccess('POST /api/admin/login');
      } else {
        apiLogFail('POST /api/admin/login', '잘못된 정보');
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 3) {
          setIsLocked(true);
          setLockdownTime(30);
          setError('보안 위반으로 30초간 잠금되었습니다.');
        } else {
          setError(`로그인 실패. 잘못된 정보입니다. (${newAttempts}/3)`);
        }
      }
    } catch (err) {
      apiLogFail('POST /api/admin/login', err);
      setError('시스템 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData) => (
    e: { target: { value: string } }
  ) => {
    setFormData((prev: typeof formData) => ({ ...prev, [field]: e.target.value }));
    if (error) setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-background to-error/20 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Grid Pattern (결정적, CSS 고정) */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `linear-gradient(45deg, transparent 40%, rgba(255, 51, 102, 0.1) 50%, transparent 60%),linear-gradient(-45deg, transparent 40%, rgba(255, 51, 102, 0.1) 50%, transparent 60%)`,
        backgroundSize: '20px 20px'
      }} />
      {/* ParticleField: 보안 테마 아이콘 파티클을 클라이언트 전용으로 렌더 */}
      {dynamic(() => import('./ParticleField').then(m => m.ParticleField), { ssr: false })({ variant: 'admin', count: 12 })}

      {/* Security Warning Banner */}
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10"
      >
        <div className="bg-error/20 border border-error/30 rounded-lg px-4 py-2 flex items-center gap-2 text-error text-sm backdrop-blur-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>관리자 전용 구역 - 무단 접근 금지</span>
        </div>
      </motion.div>

      {/* Main Admin Login Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
        className="w-full max-w-md relative z-20"
      >
        <div className="glass-effect rounded-2xl p-8 shadow-2xl relative border-2 border-error/30">
          {/* Back Button */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={onBackToLogin}
            className="absolute top-4 left-4 p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary/20"
            disabled={isSubmitting || isLoading || isLocked}
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.button>

          {/* Header */}
          <div className="text-center mb-8 mt-8">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, duration: 0.8, type: "spring", stiffness: 120 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-error to-warning mb-4 relative"
            >
              <Crown className="w-10 h-10 text-white" />
              
              {/* Pulsing Security Ring */}
              <motion.div
                animate={{ 
                  scale: [1, 1.3, 1],
                  opacity: [0.5, 0, 0.5]
                }}
                transition={{ 
                  duration: 2, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute inset-0 rounded-full border-2 border-error"
              />
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-2xl font-bold text-error mb-2"
            >
              관리자
            </motion.h1>
          </div>

          {/* Lockdown Warning */}
          <AnimatePresence>
            {isLocked && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-4 bg-error/20 border border-error/30 rounded-lg text-center"
              >
                <Lock className="w-8 h-8 text-error mx-auto mb-2" />
                <p className="text-error font-medium">보안 잠금 활성화</p>
                <p className="text-error text-sm">
                  {lockdownTime}초 후 다시 시도 가능
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          <AnimatePresence>
            {error && !isLocked && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-3 bg-error/10 border border-error/20 rounded-lg flex items-center gap-2 text-error text-sm"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Login Form */}
          <motion.form 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            {/* Admin ID Field */}
            <div className="space-y-2">
              <Label htmlFor="adminId" className="text-foreground flex items-center gap-2">
                <Shield className="w-4 h-4" />
                관리자 ID
              </Label>
              <div className="relative">
                <Crown className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-error" />
                <Input
                  id="adminId"
                  type="text"
                  value={formData.adminId}
                  onChange={handleInputChange('adminId')}
                  placeholder="관리자 ID를 입력하세요"
                  className="pl-10 bg-input-background border-error/30 focus:border-error focus:ring-error/20 text-foreground"
                  disabled={isSubmitting || isLoading || isLocked}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground flex items-center gap-2">
                <Lock className="w-4 h-4" />
                관리자 비밀번호
              </Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-error" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleInputChange('password')}
                  placeholder="관리자 비밀번호를 입력하세요"
                  className="pl-10 pr-10 bg-input-background border-error/30 focus:border-error focus:ring-error/20 text-foreground"
                  disabled={isSubmitting || isLoading || isLocked}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-error transition-colors"
                  disabled={isSubmitting || isLoading || isLocked}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <Button
              type="submit"
              disabled={isSubmitting || isLoading || isLocked}
              className="w-full bg-gradient-to-r from-error to-warning hover:opacity-90 text-white py-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-error/30"
            >
              {isSubmitting || isLoading ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                  />
                  보안 인증 중...
                </>
              ) : isLocked ? (
                <>
                  <Lock className="w-5 h-5" />
                  잠금 상태
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  관리자 인증
                </>
              )}
            </Button>
          </motion.form>

          {/* Security Info */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="mt-6 p-3 bg-warning/10 border border-warning/20 rounded-lg"
          >
            <div className="flex items-center gap-2 text-warning text-xs">
              <AlertTriangle className="w-3 h-3" />
              <span>모든 관리자 로그인 시도는 기록됩니다</span>
            </div>
          </motion.div>

          {/* Security Decorations */}
          <div className="absolute -top-3 -right-3">
            <motion.div
              animate={{ rotate: 360, scale: [1, 1.2, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="w-8 h-8 border-2 border-error/50 rounded-full flex items-center justify-center"
            >
              <Zap className="w-4 h-4 text-error" />
            </motion.div>
          </div>
          
          <div className="absolute -bottom-3 -left-3">
            <motion.div
              animate={{ rotate: -360, scale: [1, 1.1, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="w-6 h-6 border-2 border-warning/50 rounded-full flex items-center justify-center"
            >
              <Shield className="w-3 h-3 text-warning" />
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}