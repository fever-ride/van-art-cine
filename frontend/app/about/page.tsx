'use client';

import Link from 'next/link';
import { getButtonClassName, Input, Button } from '@/components/ui';
import { useState } from 'react';

export default function AboutPage() {
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [formMessage, setFormMessage] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormStatus('sending');
    setFormMessage('');

    const formData = new FormData(e.currentTarget);

    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setFormStatus('success');
        setFormMessage('Thanks for reaching out! I will get back to you soon.');
        (e.target as HTMLFormElement).reset();
      } else {
        setFormStatus('error');
        setFormMessage('Something went wrong. Please try again or email me directly.');
      }
    } catch (error) {
      setFormStatus('error');
      setFormMessage('Failed to send message. Please try again.');
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      {/* Hero Section */}
      <header className="text-center mb-16">
        <h1 className="text-5xl font-bold text-primary mb-4">
          About The Cinephile&apos;s Van
        </h1>
        <p className="text-xl text-muted leading-relaxed max-w-3xl mx-auto">
          Your guide to Vancouver&apos;s independent cinema scene
        </p>
      </header>

      {/* What We Do - Full Width Hero */}
      <section className="rounded-card border border-border bg-surface p-10 mb-12">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-primary mb-4">
            Discover Independent Cinema
          </h2>
          <p className="text-lg text-muted leading-relaxed">
            The Cinephile&apos;s Van aggregates screenings from Vancouver&apos;s best independent cinemas.
            Browse current showings, filter by theater or date, save favorites to your personal watchlist,
            and never miss a screening at your favorite indie theaters.
          </p>
        </div>
      </section>

      {/* Data Attribution */}
      <section className="rounded-card border border-border bg-surface p-8 mb-12">
        <h2 className="text-xl font-bold text-primary mb-3">Data Sources</h2>
        <p className="text-muted leading-relaxed">
          Screening times collected from cinema websites. Film metadata enriched via TMDB and OMDb APIs.
          All trademarks belong to their respective owners.
        </p>
      </section>

      {/* Contact Section - Two Columns */}
      <section className="grid md:grid-cols-2 gap-8 mb-12">
        {/* Left: Contact Form */}
        <div className="rounded-card border border-border bg-surface p-8">
          <h2 className="text-2xl font-bold text-primary mb-3">Get in Touch</h2>
          <p className="text-muted mb-6">
            Found a bug, have feedback, or just want to say hi?
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="access_key" value="3f6cbb40-3ea5-448e-b736-aab158074276" />
            <input type="hidden" name="subject" value="New message from Cinephile's Van" />
            <input type="hidden" name="from_name" value="Cinephile's Van Contact Form" />

            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-primary mb-2">
                Name
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                placeholder="Your name"
                disabled={formStatus === 'sending'}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-primary mb-2">
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="your@email.com"
                disabled={formStatus === 'sending'}
              />
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-semibold text-primary mb-2">
                Message
              </label>
              <textarea
                id="message"
                name="message"
                required
                rows={4}
                placeholder="Tell me what's on your mind..."
                disabled={formStatus === 'sending'}
                className="w-full rounded-input border border-border bg-surface px-3 py-2.5 text-[15px] leading-6 outline-none ring-0 transition disabled:opacity-60 disabled:cursor-not-allowed focus:border-accent focus:ring-1 focus:ring-accent/20"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={formStatus === 'sending'}
              className="w-full"
            >
              {formStatus === 'sending' ? 'Sending...' : 'Send Message'}
            </Button>

            {formStatus === 'success' && (
              <p className="text-sm text-success-text text-center">{formMessage}</p>
            )}
            {formStatus === 'error' && (
              <p className="text-sm text-error-text text-center">{formMessage}</p>
            )}
          </form>
        </div>

        {/* Right: Developer Info */}
        <div className="rounded-card border-2 border-accent bg-surface p-8 flex flex-col">
          <h2 className="text-2xl font-bold text-primary mb-3">
            Built by Wendy Zhong
          </h2>
          <p className="text-muted leading-relaxed mb-6 flex-grow">
            Film-loving CS student actively seeking internships and part-time developer opportunities.
            Passionate about building tools that connect people with culture and community.
          </p>
          <div className="space-y-4">
            <Link
              href="https://www.linkedin.com/in/wendi-zhong/"
              target="_blank"
              rel="noopener noreferrer"
              className={getButtonClassName({ variant: 'primary', size: 'md' }) + ' inline-flex items-center gap-2 w-full justify-center'}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M19 0h-14C2.239 0 0 2.239 0 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5V5c0-2.761-2.238-5-5-5zM8 19H5V9h3v10zm-1.5-11.3c-.966 0-1.75-.79-1.75-1.7s.784-1.7 1.75-1.7S8 5.1 8 6s-.784 1.7-1.75 1.7zM20 19h-3v-5.5c0-1.2-.02-2.7-1.65-2.7-1.65 0-1.9 1.3-1.9 2.6V19h-3V9h2.9v1.4h.04c.4-.7 1.37-1.4 2.82-1.4 3.02 0 3.78 2 3.78 4.7V19z" />
              </svg>
              Connect on LinkedIn
            </Link>

            <div className="pt-4 border-t border-border text-center">
              <p className="text-sm text-muted">
                Or email{" "}
                <a href="mailto:wendyzhong08@outlook.com" className="text-accent hover:text-accent-hover underline font-medium">
                  wendyzhong08@outlook.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-sm text-muted pb-8">
        Version 0.1.0 • Last updated {new Date().toLocaleDateString()}
      </footer>
    </main>
  );
}
