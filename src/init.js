import * as yup from 'yup';
import * as _ from 'lodash';
import axios from 'axios';
import i18next from 'i18next';
import resources from './locales/index';
import parseRSS from './rssParser';
import watch from './view';
/* eslint no-param-reassign: 0 */

const timeout = 5000;

const proxy = 'https://cors-anywhere.herokuapp.com/';
const getProxyURL = (url) => `${proxy}${url}`;

const updateFeeds = (state) => {
  const { feeds: allFeeds } = state.data;
  const arrOfPromises = allFeeds.map(({ feedUrl, feedId }) => axios.get(getProxyURL(feedUrl),
    { timeout })
    .then((response) => {
      const { posts } = state.data;
      const parsedData = parseRSS(response.data);
      const { posts: updatedPosts } = parsedData;
      const oldPosts = posts.filter(({ feedId: id }) => (id === feedId));
      const compareTitleAndLink = (updatedPost, oldPost) => {
        const { title: updatedTitle, link: updatedLink } = updatedPost;
        const { title: oldTitle, link: oldLink } = oldPost;
        return updatedTitle === oldTitle && updatedLink === oldLink;
      };
      const newPosts = _.differenceWith(updatedPosts, oldPosts, compareTitleAndLink);
      const { data } = state;
      const modifiedNewPosts = newPosts.map((post) => ({ postId: _.uniqueId(), feedId, ...post }));
      state.data = {
        ...data,
        posts: [...modifiedNewPosts, ...posts],
      };
    }));
  Promise.all(arrOfPromises).finally(() => setTimeout(() => updateFeeds(state), timeout));
};

const loadFeed = (feedUrl, state) => {
  const { stateOfLoading } = state;
  state.stateOfLoading = { ...stateOfLoading, state: 'loading' };
  axios.get(getProxyURL(feedUrl), { timeout })
    .then((response) => {
      const parsedData = parseRSS(response.data);
      const { title, posts: newPosts } = parsedData;
      const feedId = _.uniqueId();
      const modifiedNewPosts = newPosts.map((post) => ({ postId: _.uniqueId(), feedId, ...post }));
      const { feeds, posts } = state.data;
      state.data = {
        feeds: [{ feedId, title, feedUrl }, ...feeds],
        posts: [...modifiedNewPosts, ...posts],
      };
      state.stateOfLoading = { state: 'loaded', loadingError: null };
      setTimeout(() => updateFeeds(state), timeout);
    })
    .catch((error) => {
      state.stateOfLoading = { state: 'failed', loadingError: `Error: ${error.message}` };
    });
};

const init = () => {
  const state = {
    data: { posts: [], feeds: [] },
    stateOfForm: { validError: null, isValid: true },
    stateOfLoading: { state: 'loading', loadingError: null },
  };

  const docElements = {
    form: document.querySelector('.rss-form'),
    feedback: document.querySelector('.feedback'),
    submitBtn: document.querySelector('.btn'),
    feeds: document.querySelector('.feeds'),
    input: document.querySelector('.form-control'),
  };

  const schema = yup.string()
    .when('$urlsList', (urlsList) => yup.string()
      .url(i18next.t('messages.invalidURL'))
      .notOneOf(urlsList, i18next.t('messages.duplicatedURL')));

  const checkFormValidity = (url, urls) => {
    try {
      schema.validateSync(url, { context: { urlsList: urls } });
      return false;
    } catch (error) {
      return error.message;
    }
  };

  const watchedState = watch(state, docElements);

  i18next.init({
    lng: 'en',
    debug: true,
    resources,
  }).then(() => {
    const { form } = docElements;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const feedUrl = formData.get('url');
      const urlsList = watchedState.data.feeds.map(({ feedUrl: url }) => url);
      const validityError = checkFormValidity(feedUrl, urlsList);
      if (validityError) {
        watchedState.stateOfForm = { validError: `Error: ${validityError}`, isValid: false };
      } else {
        watchedState.stateOfForm = { validError: null, isValid: true };
        loadFeed(feedUrl, watchedState);
      }
    });
  });
};

export default init;
