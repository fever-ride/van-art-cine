import Link from 'next/link';
import { Noto_Sans } from 'next/font/google';

const noto = Noto_Sans({ subsets: ['latin'], weight: ['400', '500'] });

export default function Footer() {
  const linkStyle = 'text-muted hover:text-accent transition-colors text-xs';

  return (
    <footer className={`${noto.className} bg-footer-bg border-t border-border-subtle mt-24`}>
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Top Row: Discover, Cinemas, About */}
        <div className="flex flex-wrap gap-x-16 gap-y-8 mb-10">
          {/* Discover */}
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-wide mb-4 text-primary">
              Discover
            </h3>
            <ul className="space-y-3">
              <li>
                <Link href="/" className={linkStyle}>
                  Film Listings
                </Link>
              </li>
              <li>
                <Link href="/watchlist" className={linkStyle}>
                  Watchlist
                </Link>
              </li>
            </ul>
          </div>

          {/* Cinemas */}
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-wide mb-4 text-primary">
              Cinemas
            </h3>
            <ul className="space-y-3">
              <li>
                <a
                  href="https://thecinematheque.ca/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkStyle}
                >
                  The Cinematheque
                </a>
              </li>
              <li>
                <a
                  href="https://riotheatre.ca/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkStyle}
                >
                  Rio Theatre
                </a>
              </li>
              <li>
                <a
                  href="https://viff.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkStyle}
                >
                  VIFF
                </a>
              </li>
            </ul>
          </div>

          {/* About */}
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-wide mb-4 text-primary">
              About
            </h3>
            <ul className="space-y-3">
              <li>
                <Link href="/about" className={linkStyle}>
                  About This Project
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/fever-ride/van-art-cine"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkStyle}
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Row: Film Festivals */}
        <div className="border-t border-border-light pt-8">
          <h3 className="text-[11px] font-medium uppercase tracking-wide mb-4 text-primary">
            Film Festivals
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3">
            {/* Film Festivals - Column 1 */}
            <div>
              <a
                href="https://viff.org"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                Vancouver International Film Festival
              </a>
            </div>
            <div>
              <a
                href="https://vimff.org"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                Vancouver International Mountain Film Festival
              </a>
            </div>
            <div>
              <a
                href="https://vaff.org"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                Vancouver Asian Film Festival
              </a>
            </div>
            <div>
              <a
                href="https://outonscreen.com/vqff/"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                Vancouver Queer Film Festival
              </a>
            </div>
            <div>
              <a
                href="https://www.vsff.com"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                Vancouver Short Film Festival
              </a>
            </div>
            <div>
              <a
                href="https://www.doxafestival.ca"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                DOXA Documentary Film Festival
              </a>
            </div>
            <div>
              <a
                href="https://www.vjff.org"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                Vancouver Jewish Film Festival
              </a>
            </div>
            <div>
              <a
                href="https://www.vlaff.org"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                Vancouver Latin American Film Festival
              </a>
            </div>
            <div>
              <a
                href="https://www.menafilmfestival.com"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                MENA Film Festival
              </a>
            </div>
            <div>
              <a
                href="https://www.vancouverhorrorshow.com"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                Vancouver Horror Show Film Festival
              </a>
            </div>
            <div>
              <a
                href="https://www.vtfs.org"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                Vancouver Taiwanese Film Festival
              </a>
            </div>
            <div>
              <a
                href="https://www.vancouverblackfilmfest.com"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                Vancouver International Black Film Festival
              </a>
            </div>
            <div>
              <a
                href="https://www.vcff.org"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                Vancouver Chinese Film Festival
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
