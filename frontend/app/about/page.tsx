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

      {/* What We Do */}
      <section className="mb-12">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-primary mb-4">
            Discover Independent Cinema
          </h2>
          <p className="text-lg text-muted leading-relaxed mb-6">
            The Cinephile&apos;s Van aggregates screenings from Vancouver&apos;s best independent cinemas.
            Browse current showings, filter by theater or date, save favorites to your personal watchlist,
            and never miss a screening at your favorite indie theaters.
          </p>
          <p className="text-sm text-muted">
            Screening times collected from cinema websites. Film metadata enriched via TMDB and OMDb APIs.
          </p>
        </div>
      </section>

      {/* Contact Section */}
      <section className="max-w-2xl mx-auto mb-12">
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

        {/* Developer Info - Simple text below */}
        <div className="mt-8 text-center text-sm text-muted">
          <p>
            Built by{' '}
            <Link
              href="https://www.linkedin.com/in/wendi-zhong/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-hover underline"
            >
              Wendy Zhong
            </Link>
            {' '}• CS student seeking internships and part-time opportunities
          </p>
          <p className="mt-2">
            <a href="mailto:wendyzhong08@outlook.com" className="text-accent hover:text-accent-hover underline">
              wendyzhong08@outlook.com
            </a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-sm text-muted pb-8">
        Version 0.1.0 • Last updated {new Date().toLocaleDateString()}
      </footer>
    </main>
  );
}
