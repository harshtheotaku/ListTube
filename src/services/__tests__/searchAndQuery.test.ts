import { describe, expect, it } from 'vitest';
import { mangaOriginLabel } from '../../types';
import { buildPageQueryVariables } from '../anilist';
import { matchScore } from '../search';
import { buildMalAuthorizeUrl, generatePkceVerifier } from '../trackers';

describe('search, multi-axis filter variables, origin labels & PKCE OAuth', () => {
  it('combines multi-axis genres, tags, year range, format, country and min score cleanly', () => {
    const vars = buildPageQueryVariables({
      mediaType: 'ANIME',
      genres: ['Action', 'Fantasy'],
      tags: ['Time Manipulation'],
      formats: ['TV'],
      status: 'FINISHED',
      countryOfOrigin: 'JP',
      yearMin: 2020,
      yearMax: 2026,
      minScore: 8.0,
      sort: ['SCORE_DESC'],
      page: 2,
      perPage: 24,
    });

    expect(vars.genreIn).toEqual(['Action', 'Fantasy']);
    expect(vars.tagIn).toEqual(['Time Manipulation']);
    expect(vars.formatIn).toEqual(['TV']);
    expect(vars.startDateGreater).toBe(20200000);
    expect(vars.startDateLesser).toBe(20261231);
    expect(vars.averageScoreGreater).toBe(80);
    expect(vars.page).toBe(2);
  });

  it('derives accurate region labels for manga, manhwa, and manhua', () => {
    expect(mangaOriginLabel({ countryOfOrigin: 'KR' })).toBe('MANHWA');
    expect(mangaOriginLabel({ countryOfOrigin: 'CN' })).toBe('MANHUA');
    expect(mangaOriginLabel({ countryOfOrigin: 'JP' })).toBe('MANGA');
  });

  it('ranks prefix matches above distant subsequence hits', () => {
    const aot = {
      id: 'anilist:16498',
      mediaType: 'ANIME' as const,
      source: 'anilist' as const,
      title: 'Attack on Titan',
      titleRomaji: 'Shingeki no Kyojin',
      cover: 'x',
      banner: 'x',
      description: '',
      genres: [],
      tags: [],
      studios: [],
      popularity: 700000,
      streaming: [],
      similar: [],
      fetchedAt: 1,
    };
    const other = { ...aot, id: 'anilist:2', title: 'Another World', titleRomaji: 'Isekai', popularity: 50000 };
    expect(matchScore('Attack', aot)).toBeGreaterThan(matchScore('Attack', other));
  });

  it('generates valid MAL OAuth 2.0 PKCE challenge and URL', () => {
    const verifier = generatePkceVerifier(64);
    expect(verifier).toHaveLength(64);
    const url = buildMalAuthorizeUrl({
      clientId: 'test-client',
      redirectUri: 'https://harshtheotaku.github.io/ListTube',
      codeChallenge: verifier,
      state: 'mal:123',
    });
    expect(url).toContain('https://myanimelist.net/v1/oauth2/authorize');
    expect(url).toContain('code_challenge_method=plain');
    expect(url).toContain('state=mal%3A123');
  });
});
