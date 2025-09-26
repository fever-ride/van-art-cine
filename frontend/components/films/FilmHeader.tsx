'use client';

import type { Film } from '@/app/lib/films';

type Props = { 
  film: Pick<Film, 'title' | 'description' | 'imdb_rating' | 
	'rt_rating_pct' | 'imdb_votes' | 'imdb_url'> };

export default function FilmHeader({ film }: Props) {
	const {title, description} = film;
return (
	<>
	<h1 className="mb-4 text-2xl font-semibold">{title}</h1>
	
	<section className='rounded-xl border p-4 md:p-6 bg-white shadow-sm'>
		<div className='grid gap-6 md:grid-cols-12'>
				<div className='md:col-span-7'>
					<h2 className="sr-only">Description</h2>
					<div className={`text-sm leading-6 ${description ? 'text-gray-700' : 'text-gray-400 italic'}`}>
						{description || 'No description available'}
					</div>
				</div>
				<div className='md:col-span-5 md:pl-6 md:border-l md:border-gray-200'>
					<div className="space-y-2">
						{/* IMDb rating */}
						<div className="flex items-baseline justify-between text-sm">
							<span className="text-gray-500">IMDb Rating</span>
							<span className="font-medium">
								{film.imdb_rating ?? '-'}
							</span>
						</div>

						{/* IMDb votes */}
						<div className="flex items-baseline justify-between text-sm">
							<span className="text-gray-500">IMDb Votes</span>
							<span className="font-medium">
								{film.imdb_votes
									? film.imdb_votes.toLocaleString()
									: '-'}
							</span>
						</div>

						{/* Rotten Tomatoes rating */}
						<div className="flex items-baseline justify-between text-sm">
							<span className="text-gray-500">Rotten Tomatoes</span>
							<span className="font-medium">
								{film.rt_rating_pct != null
									? `${film.rt_rating_pct}%`
									: '-'}
							</span>
						</div>

						{/* Links row */}
						<div className="flex items-baseline justify-between text-sm">
							<span className="text-gray-500">Links</span>
							<span className="font-medium space-x-2">
								{film.imdb_url && (
									<a
										href={film.imdb_url}
										target="_blank"
										rel="noopener noreferrer"
										className="text-blue-600 hover:underline"
									>
										IMDb
									</a>
								)}
							</span>
						</div>
					</div>
				</div>
			</div>
	</section>
	</>
);
}