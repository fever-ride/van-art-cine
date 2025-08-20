import requests
from db_helper import DB, conn_open, norm_space, norm_title, strip_dir_prefix, fetch_all_films, upsert_person, upsert_film_person

OMDB_API_KEY = "cf07f36c"
OMDB_URL = "http://www.omdbapi.com/"

def fetch_omdb_data(film):
    params = {"apikey": OMDB_API_KEY}
    if film.get("imdb_id"):
        params["i"] = film["imdb_id"]
    else:
        params["t"] = film["title"]
        if film.get("year"):
            params["y"] = film["year"]
    response = requests.get(OMDB_URL, params=params)
    return response.json() if response.status_code == 200 else None

def update_film_omdb_fields(conn, film_id, omdb_data):
    with conn.cursor() as cursor:
        sql = '''
            UPDATE film SET
                rated = %s,
                genre = %s,
                language = %s,
                country = %s,
                awards = %s,
                rt_rating_pct = %s,
                imdb_rating = %s
            WHERE id = %s
        '''
        cursor.execute(sql, (
            omdb_data.get('Rated'),
            omdb_data.get('Genre'),
            omdb_data.get('Language'),
            omdb_data.get('Country'),
            omdb_data.get('Awards'),
            omdb_data.get('Ratings', [{}])[1].get('Value') if len(omdb_data.get('Ratings', [])) > 1 else None,
            omdb_data.get('imdbRating'),
            film_id
        ))

def main():
    conn = conn_open()
    films = fetch_all_films(conn)
    for film in films:
        omdb_data = fetch_omdb_data(film)
        if not omdb_data or omdb_data.get("Response") == "False":
            print(f"OMDb not found for film: {film['title']}")
            continue
        update_film_omdb_fields(conn, film["id"], omdb_data)
        # Handle persons (director, writer, cast)
        for role in ["Director", "Writer", "Actors"]:
            names = omdb_data.get(role, "").split(",")
            for name in names:
                name = name.strip()
                if not name:
                    continue
                person_id = upsert_person(conn, name)
                upsert_film_person(conn, film["id"], person_id, role.lower() if role != "Actors" else "cast")
    conn.close()

if __name__ == "__main__":
    main()
