import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { TmdbSearchResponse } from '../models/tmdb.model';
import { map } from 'rxjs';
import { SearchResult } from '../models/watchlist-item.model';
@Injectable({
  providedIn: 'root',
})
export class SearchService {
  constructor(private http: HttpClient) {
    this.getTmdbGenres();
  }
  url = 'https://api.themoviedb.org/3/search/multi';
  tmdbTvGenreMap: Record<number, string> = {};
  tmdbMovieGenreMap: Record<number, string> = {};

  searchTmdb(query: string): any {
    const params = {
      api_key: environment.tmdb.apiKey,
      query: query,
    };
    return this.http.get<TmdbSearchResponse>(this.url, { params }).pipe(
      map((response) =>
        (response.results || []).filter(
          (result) => result.media_type === 'movie' || result.media_type === 'tv',
        ),
      ),
      map((response) => this.mapToSearchResults(response)),
    );
  }
  mapToSearchResults(results: TmdbSearchResponse['results']): SearchResult[] {
    return results.map((result) => ({
      title: result.media_type === 'movie' ? (result.title ?? '') : (result.name ?? ''),
      type: result.media_type === 'movie' ? 'movie' : 'series',
      genres: result.genre_ids.map((id) => this.getGenreNameById(id, result.media_type)),
      duration_minutes: null, // TMDb doesn't provide runtime in search results, would need an additional API call to fetch details
      episode_count:
        result.media_type === 'tv' && result.episode_run_time
          ? result.episode_run_time.length
          : null,
      poster_url: result.poster_path
        ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
        : null,
      external_id: result.id.toString(),
      external_source: 'tmdb',
    }));
  }

  private getGenreNameById(id: number, mediaType: 'movie' | 'tv'): string {
    if (mediaType === 'movie') {
      return this.tmdbMovieGenreMap[id] || 'Unknown';
    } else {
      return this.tmdbTvGenreMap[id] || 'Unknown';
    }
  }
  getTmdbGenres() {
    this.getTmdbTvGenres().subscribe((genres) => {
      this.tmdbTvGenreMap = genres.reduce(
        (acc: Record<number, string>, genre) => {
          acc[genre.id] = genre.name;
          return acc;
        },
        {} as Record<number, string>,
      );
    });
    this.getTmdbMovieGenres().subscribe((genres) => {
      this.tmdbMovieGenreMap = genres.reduce(
        (acc: Record<number, string>, genre) => {
          acc[genre.id] = genre.name;
          return acc;
        },
        {} as Record<number, string>,
      );
    });
  }
  //
  getTmdbTvGenres() {
    const url = 'https://api.themoviedb.org/3/genre/tv/list';
    const params = {
      api_key: environment.tmdb.apiKey,
    };
    return this.http
      .get<{ genres: { id: number; name: string }[] }>(url, { params })
      .pipe(map((response) => response.genres));
  }
  getTmdbMovieGenres() {
    const url = 'https://api.themoviedb.org/3/genre/movie/list';
    const params = {
      api_key: environment.tmdb.apiKey,
    };
    return this.http
      .get<{ genres: { id: number; name: string }[] }>(url, { params })
      .pipe(map((response) => response.genres));
  }
}
/* 
{
  "page": 1,
  "results": [
    {
      "adult": true,
      "id": 123092,
      "name": "Bridgette B",
      "original_name": "Bridgette B",
      "media_type": "person",
      "popularity": 26.792,
      "gender": 1,
      "known_for_department": "Acting",
      "profile_path": "/28DDqaeGgcCVwPZuC0pvs3vfYTF.jpg",
      "known_for": [
        {
          "adult": true,
          "backdrop_path": "/9ubX2yFVZBlOK2psv8Bv3z92l9c.jpg",
          "id": 46265,
          "title": "Body Heat",
          "original_title": "Body Heat",
          "overview": "Fire has never been so hot since these sexy firefighters took over the station. Dangerous explosions, life or death situations, and powerful desire makes everyone live for the moment.",
          "poster_path": "/ooq7nh3A5FVEBjwjrvcFfor7G5H.jpg",
          "media_type": "movie",
          "original_language": "en",
          "genre_ids": [
            28,
            18
          ],
          "popularity": 0,
          "release_date": "2010-09-21",
          "video": false,
          "vote_average": 7.8,
          "vote_count": 35
        },
        {
          "adult": false,
          "backdrop_path": null,
          "id": 506822,
          "title": "Double D Dude Ranch",
          "original_title": "Double D Dude Ranch",
          "overview": "When a beautiful, but greedy and conniving, temptress attempts to take over the DD Dude Ranch, the very busty owner and the ranch hands that work there must pull together to outsmart her and thwart her evil plan.",
          "poster_path": "/jQbsiPA50F2TRQLYWBIehG3aeuw.jpg",
          "media_type": "movie",
          "original_language": "en",
          "genre_ids": [
            37,
            35
          ],
          "popularity": 1.0294,
          "release_date": "2016-07-20",
          "video": false,
          "vote_average": 4.4,
          "vote_count": 15
        },
        {
          "adult": false,
          "backdrop_path": "/wFASwHuWWoamkfnfpcbMuzDUYVa.jpg",
          "id": 403100,
          "title": "Scared Topless",
          "original_title": "Scared Topless",
          "overview": "A group of unsuspecting college students explore a haunted house and get more than they bargained for when the sexual frenzy of the paranormal world reveals itself.",
          "poster_path": "/3bsTVoTl2UAHSMla8GXFjxf6w21.jpg",
          "media_type": "movie",
          "original_language": "en",
          "genre_ids": [
            35,
            27,
            9648,
            10749
          ],
          "popularity": 1.7975,
          "release_date": "2015-10-01",
          "video": false,
          "vote_average": 4.3,
          "vote_count": 29
        }
      ]
    },
    {
      "adult": false,
      "backdrop_path": "/iVadPLeLVb97RznIGDkswxtBzi6.jpg",
      "id": 91239,
      "name": "Bridgerton",
      "original_name": "Bridgerton",
      "overview": "Wealth, lust, and betrayal set in the backdrop of Regency era England, seen through the eyes of the powerful Bridgerton family.",
      "poster_path": "/uXTg565ahu9RwonCX1V2Hex1NU6.jpg",
      "media_type": "tv",
      "original_language": "en",
      "genre_ids": [
        18
      ],
      "popularity": 154.7028,
      "first_air_date": "2020-12-25",
      "vote_average": 8.073,
      "vote_count": 3212,
      "origin_country": [
        "US"
      ]
    },
    {
      "adult": false,
      "id": 3782034,
      "name": "Bridge",
      "original_name": "Bridge",
      "media_type": "person",
      "popularity": 0.2628,
      "gender": 0,
      "known_for_department": "Acting",
      "profile_path": null,
      "known_for": [
        {
          "adult": false,
          "backdrop_path": "/ySzItvbTqSJ3feKiueMFwAlH17y.jpg",
          "id": 131040,
          "name": "Call Me By Fire",
          "original_name": "披荆斩棘",
          "overview": "The male version of Sisters Who Make Waves. The show focuses on breaking the limit plus challenging oneself, and opening up the long-lost dream of being in a boy band for the brothers. Regarding the competition system, after three months of live-in training & subject assessment, the winning team will finally be born and make their debut in a group.",
          "poster_path": "/hB5wJgHi7g04zcTTn92bshEKkQ4.jpg",
          "media_type": "tv",
          "original_language": "zh",
          "genre_ids": [
            10764
          ],
          "popularity": 30.0156,
          "first_air_date": "2021-08-12",
          "vote_average": 8,
          "vote_count": 6,
          "origin_country": [
            "CN"
          ]
        },
        {
          "adult": false,
          "backdrop_path": "/zKYAlm3B6uEYBjGUJJjno49dhLg.jpg",
          "id": 138966,
          "name": "Night in the Greater Bay",
          "original_name": "大湾仔的夜",
          "overview": "A Chinese variety program focusing on the running a \"dai pai tong\" restaurant located in the Greater Bay Area, witnessing the development of the country, promoting food and cultural exchanges between Guangdong, Macau and Hong Kong.  A spin off variety show from 2021's popular \"Call Me By Fire\" from Hunan station, the five Hong Kong based members - Jordan Chan, Julian Cheung, Michael Tse, Jerry Lamb and Edmund Leung, are selected to jointly operate a Hong Kong-style food stall in Guangzhou. Through immersive filming, the program will record the daily events around the 5 members, the preparation of food, songs and entertainment to heal the anxiety of the diners with sincere communication and an optimistic attitude towards life.",
          "poster_path": "/3arfP3HvxYEkPkcOHAk4QzGwyHL.jpg",
          "media_type": "tv",
          "original_language": "zh",
          "genre_ids": [
            10764
          ],
          "popularity": 6.9007,
          "first_air_date": "2021-11-17",
          "vote_average": 0,
          "vote_count": 0,
          "origin_country": [
            "CN"
          ]
        }
      ]
    },
    {
      "adult": false,
      "backdrop_path": "/7nX2uLLaVnFUR6azLDXQsjQBQvI.jpg",
      "id": 45016,
      "name": "The Bridge",
      "original_name": "Bron/Broen",
      "overview": "When a body is found on the bridge between Denmark and Sweden, right on the border, Danish inspector Martin Rohde and Swedish Saga Norén have to share jurisdiction and work together to find the killer.",
      "poster_path": "/v8V9hLWArWhoIdmZ1ujmWrJZL6J.jpg",
      "media_type": "tv",
      "original_language": "sv",
      "genre_ids": [
        80,
        9648,
        18
      ],
      "popularity": 18.8931,
      "first_air_date": "2011-09-21",
      "vote_average": 8.097,
      "vote_count": 682,
      "origin_country": [
        "SE"
      ]
    },
    {
      "adult": false,
      "id": 4532642,
      "name": "Bridge",
      "original_name": "Bridge",
      "media_type": "person",
      "popularity": 0,
      "gender": 0,
      "known_for_department": "Acting",
      "profile_path": null,
      "known_for": [
        {
          "adult": false,
          "backdrop_path": "/auvhN9FYxC2YTrqyNK9u2aghAeO.jpg",
          "id": 1244062,
          "title": "Vimy Bridge",
          "original_title": "Vimy Bridge",
          "overview": "After their marriage on the first date, Julia and Adam drove around for a while until they got the idea to sit under this very bridge. Julia likes bridge 👍.",
          "poster_path": "/yEpronip8rFLySLwmMUkvCVTmEM.jpg",
          "media_type": "movie",
          "original_language": "en",
          "genre_ids": [
            10749,
            10752,
            9648,
            27
          ],
          "popularity": 0.0286,
          "release_date": "2024-02-11",
          "video": false,
          "vote_average": 10,
          "vote_count": 1
        }
      ]
    },
    {
      "adult": true,
      "id": 100611,
      "name": "Bridgette Monet",
      "original_name": "Bridgette Monet",
      "media_type": "person",
      "popularity": 6.822,
      "gender": 1,
      "known_for_department": "Acting",
      "profile_path": "/thOUywwQWiKBKeNhq9txKFJqOUG.jpg",
      "known_for": [
        {
          "adult": true,
          "backdrop_path": "/9UyKiNWCYQdXHXhgnJJp5iRcg9m.jpg",
          "id": 496852,
          "title": "Sorority Sweethearts",
          "original_title": "Sorority Sweethearts",
          "overview": "Sorority Sweethearts follows the carnal hi-jinx of a group of lusty sorority sisters and their voluptuous house mother (Lisa DeLeeuw), over the course of one pleasure-filled day… and night.",
          "poster_path": "/xbpf5ZzODQlLNzEtvTkdoqOJkQB.jpg",
          "media_type": "movie",
          "original_language": "en",
          "genre_ids": [
            18
          ],
          "popularity": 0,
          "release_date": "1983-01-01",
          "video": false,
          "vote_average": 5.8,
          "vote_count": 8
        },
        {
          "adult": true,
          "backdrop_path": "/ltyMEAmE32GTpGTW75FxggMQ1m0.jpg",
          "id": 496623,
          "title": "I Like to Watch",
          "original_title": "I Like to Watch",
          "overview": "Designer Leticia has a house full of action. While she has a lover, her worker Kim seduces the plumber and the maid. As a client couple seduces nephew Laura, and two models seduce her abstaining boyfriend Michael, they finally unite.",
          "poster_path": "/qY40UapP9oMsQTUior0Sr0JauUR.jpg",
          "media_type": "movie",
          "original_language": "en",
          "genre_ids": [
            10749
          ],
          "popularity": 0,
          "release_date": "1982-01-01",
          "video": false,
          "vote_average": 6.9,
          "vote_count": 10
        },
        {
          "adult": true,
          "backdrop_path": null,
          "id": 506994,
          "title": "Letters of Love",
          "original_title": "Letters of Love",
          "overview": "An eager to please journalist (Bridgette Monet) takes over a steamy advice to the lovelorn column with explosively erotic results. As “Dear Candy,” Bridgette starts to visualize the amorous escapades, much to her excitement-and ours too!  First up, a horny teenager’s risky business with an eager call girl turns the boy into a man pronto! Then we see the story of a taboo-laden mother-son relationship, a titillating tale of teenage party habits, the adventures of a lonesome cowpoke who knows how to use his ramrod to its best advantage and finally, a marriage is saved when a frustrated husband discovers a little discipline goes a long way with his wife.  Even Bridgette gets into the act when her column becomes a tremendous success. Using her head, the clever girl manages to get a raise from her boss in more ways than one!",
          "poster_path": "/glpg1mD5rls3a3ssDyir4duWmrh.jpg",
          "media_type": "movie",
          "original_language": "en",
          "genre_ids": [],
          "popularity": 0,
          "release_date": "1985-02-23",
          "video": false,
          "vote_average": 5.6,
          "vote_count": 5
        }
      ]
    },
    {
      "adult": false,
      "backdrop_path": "/9jYMtoTVxKWtNEJ33SVsmiESLuo.jpg",
      "id": 535883,
      "title": "Bridge",
      "original_title": "Bridge",
      "overview": "Dan, a closeted homosexual, goes to a cruising area under a bridge to confront his darkest secret. It isn't until he meets a younger and more confident Paul that he realises his biggest fear is just the beginning of something much closer to home.",
      "poster_path": "/wyGZpVE4wvMg1hPByCOf9GoaSqE.jpg",
      "media_type": "movie",
      "original_language": "en",
      "genre_ids": [
        18,
        9648
      ],
      "popularity": 0.365,
      "release_date": "2016-08-15",
      "video": false,
      "vote_average": 8,
      "vote_count": 3
    },
    {
      "adult": false,
      "backdrop_path": null,
      "id": 1326529,
      "title": "Bridge",
      "original_title": "Bridge",
      "overview": "A young receptionist forms a coincidental bond with a patient over the phone, who helps her reconnect with the world and her place in it.",
      "poster_path": "/nWdOIwJup3cmpeLjhklnJH2kPcF.jpg",
      "media_type": "movie",
      "original_language": "en",
      "genre_ids": [],
      "popularity": 0,
      "release_date": "2023-05-01",
      "video": false,
      "vote_average": 0,
      "vote_count": 0
    },
    {
      "adult": false,
      "backdrop_path": "/6JFeugEg8SK7uXm6ljvy37xKjKq.jpg",
      "id": 59215,
      "name": "Old Bridge Secret",
      "original_name": "El secreto de Puente Viejo",
      "overview": "",
      "poster_path": "/diLOWF0QFtWl4vYcPHV9xPmCkGp.jpg",
      "media_type": "tv",
      "original_language": "es",
      "genre_ids": [
        18,
        10766
      ],
      "popularity": 15.5079,
      "first_air_date": "2011-02-23",
      "vote_average": 5.7,
      "vote_count": 11,
      "origin_country": [
        "ES"
      ]
    },
    {
      "adult": false,
      "backdrop_path": "/dg7I4XstzkiTi7vuwuWZXOxobTO.jpg",
      "id": 702283,
      "title": "Bridge",
      "original_title": "Bridge",
      "overview": "On August 1, 2007, the sudden collapse of the I-35W bridge in downtown Minneapolis shaped a community. Spencer Patzman’s debut documentary follows the many personal stories of one tragedy and the countless ways it is felt more than 12 years later.",
      "poster_path": "/cTSslQPg4QjvgsmarPVZzRWMWNr.jpg",
      "media_type": "movie",
      "original_language": "en",
      "genre_ids": [
        99
      ],
      "popularity": 0.0491,
      "release_date": "2020-05-15",
      "video": false,
      "vote_average": 0,
      "vote_count": 0
    },
    {
      "adult": false,
      "backdrop_path": "/dePhRKfkfXBOdz1GG5KGVt2jAPs.jpg",
      "id": 1354513,
      "title": "Bridge",
      "original_title": "Bridge",
      "overview": "Two strangers, both suffering from immense emotional distress arising out of life's tragedies, wanting to commit suicide, meet on a Bridge over the Ganges. For both, the meeting initially brings great challenges but eventually 'healing' at physical, mental, emotional and spiritual levels",
      "poster_path": "/8lldlHbTv9I64p9Dfs5tRUNX2wu.jpg",
      "media_type": "movie",
      "original_language": "bn",
      "genre_ids": [
        18
      ],
      "popularity": 0.1504,
      "release_date": "2017-06-28",
      "video": false,
      "vote_average": 0,
      "vote_count": 0
    },
    {
      "adult": false,
      "backdrop_path": "/bwoLjYWxbRXGPbbM93jazBJZiUg.jpg",
      "id": 892615,
      "title": "Bridge",
      "original_title": "Bridge",
      "overview": "Here the protagonist uses the concept of lucid dreaming and accidentally solves his dilemma.",
      "poster_path": "/hYBEdjEWAJQTVjoxpriqoRnkULy.jpg",
      "media_type": "movie",
      "original_language": "ml",
      "genre_ids": [
        53,
        9648
      ],
      "popularity": 0.0461,
      "release_date": "2017-12-27",
      "video": false,
      "vote_average": 0,
      "vote_count": 0
    },
    {
      "adult": false,
      "backdrop_path": null,
      "id": 1217764,
      "title": "Bridge",
      "original_title": "Bridge",
      "overview": "A study of three similar but distinct microcultures: the Manhattan Bridge, Brooklyn Bridge, and Williamsburg Bridge. Interrogated through the use of contact microphones, the physical infrastructures of these bridges become audible and reveal their inherent macroacoustics. The film treats the bridge as an anthropological body for discourse, as a physiology of limbs, organs, eyes, and ears moving in time.",
      "poster_path": "/y6vNR2wvoDvtkYryXXqzDpzh7dv.jpg",
      "media_type": "movie",
      "original_language": "en",
      "genre_ids": [
        99
      ],
      "popularity": 0.0214,
      "release_date": "2013-01-24",
      "video": false,
      "vote_average": 0,
      "vote_count": 0
    },
    {
      "adult": false,
      "backdrop_path": null,
      "id": 1536658,
      "title": "Bridge",
      "original_title": "Bridge",
      "overview": "",
      "poster_path": null,
      "media_type": "movie",
      "original_language": "hi",
      "genre_ids": [],
      "popularity": 0.1543,
      "release_date": "",
      "video": false,
      "vote_average": 0,
      "vote_count": 0
    },
    {
      "adult": false,
      "backdrop_path": null,
      "id": 770104,
      "title": "Bridge",
      "original_title": "Bridge",
      "overview": "The film, set in the most diverse city Toronto, follows two couples on an usual Summer weekend where we reveal the complexity of the their relationship. It's about love, diversity, cultural differences and liberation.",
      "poster_path": "/q06z0BTt6Ih064FyvZbP5J2im2A.jpg",
      "media_type": "movie",
      "original_language": "en",
      "genre_ids": [],
      "popularity": 0.0214,
      "release_date": "2012-12-31",
      "video": false,
      "vote_average": 1,
      "vote_count": 2
    },
    {
      "adult": false,
      "backdrop_path": "/e8wKfKwe3fw5akUIx2oGGvQd9kx.jpg",
      "id": 1355523,
      "title": "Bridge",
      "original_title": "Bridge",
      "overview": "This crafted short film transports you to a bumpy world of railways, making you feel as if you are traveling east. Animation based on engravings by artist from Dnipro (Ukraine) Andrii Sokolenko.",
      "poster_path": "/921GtZnFt94RtO30cbkv1kA6ukO.jpg",
      "media_type": "movie",
      "original_language": "en",
      "genre_ids": [
        16
      ],
      "popularity": 0.0143,
      "release_date": "2024-09-06",
      "video": false,
      "vote_average": 0,
      "vote_count": 0
    },
    {
      "adult": false,
      "backdrop_path": null,
      "id": 735087,
      "title": "Bridge",
      "original_title": "Bridge",
      "overview": "",
      "poster_path": null,
      "media_type": "movie",
      "original_language": "fr",
      "genre_ids": [],
      "popularity": 0.0143,
      "release_date": "",
      "video": false,
      "vote_average": 0,
      "vote_count": 0
    },
    {
      "adult": false,
      "backdrop_path": null,
      "id": 330093,
      "title": "Bridge",
      "original_title": "Bridge",
      "overview": "Bridge is a story about four animal characters trying to cross a bridge, but ending up as obstacles to one another in the process. The moral behind this story revolves around how there are often disagreements or competing paths in life, and the possible results of pride, obstinance, and compromise.",
      "poster_path": "/7NC6Sq9hM0b2fe4wnamyBCiEkf9.jpg",
      "media_type": "movie",
      "original_language": "en",
      "genre_ids": [
        16
      ],
      "popularity": 0.0281,
      "release_date": "2010-05-01",
      "video": false,
      "vote_average": 6.2,
      "vote_count": 3
    },
    {
      "adult": false,
      "backdrop_path": null,
      "id": 489197,
      "title": "Bridge",
      "original_title": "Bridge",
      "overview": "A 16mm film of the changing reflections of a bridge over the lake in the grounds of South Hill Park, Berkshire, which links a public thoroughfare.  The film can be thought of as a metaphor for the representational process and the cinematic ‘apparatus’ itself, with the ‘bridging process’ connecting the ‘real’ bridge with its representation as a reflected image on water surface, the reflected image on water to camera and film emulsion, the projected film image to the screen and the screen to the film viewer in the cinema. To push this still a stage further, it acts as a metaphoric link between theory and practice (a stills sequence from Bridge appeared on the first page of the first edition of Undercut Magazine).",
      "poster_path": "/4jRFquPZHSRILqIh7y2ynZrm9Ug.jpg",
      "media_type": "movie",
      "original_language": "en",
      "genre_ids": [],
      "popularity": 0.0143,
      "release_date": "1980-02-12",
      "video": false,
      "vote_average": 0,
      "vote_count": 0
    },
    {
      "adult": false,
      "backdrop_path": null,
      "id": 389899,
      "title": "Bridge",
      "original_title": "Bridge",
      "overview": "A supercut of the Golden Gate Bridge and water.",
      "poster_path": "/3VpvWi3kmOA2PASPxKT33YXnYo0.jpg",
      "media_type": "movie",
      "original_language": "en",
      "genre_ids": [],
      "popularity": 0.083,
      "release_date": "2012-12-31",
      "video": false,
      "vote_average": 0,
      "vote_count": 0
    }
  ],
  "total_pages": 129,
  "total_results": 2574
}
 */
