import classNames from 'classnames';
import { format } from 'date-fns';
import _ from 'lodash';
import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import GoogleLogin, {
  GoogleLoginResponse,
  GoogleLoginResponseOffline,
  GoogleLogout,
} from 'react-google-login';
import ago from 's-ago';

import styles from './App.module.css';
import { useAnimationFrame } from './useAnimationFrame';
import { usePersistentState } from './usePersistentState';

const clientId = process.env.REACT_APP_CLIENT_ID ?? '';
const apiKey = 'AIzaSyD01PlE0xERSwpZQauir8ZisF5e7LuNAbo';
const ONE_MINUTE = 60;
const ONE_HOUR = ONE_MINUTE * 60;

const calendarScope =
  'https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.readonly';

interface CustomEvent extends gapi.client.calendar.Event {
  happeningNow: boolean;
  pending: boolean;
  secondsLeft: number;
  ago: string;
}

const App: FunctionComponent = () => {
  const [gapiToken, setGapiToken] = useState(
    window.localStorage.getItem('gapi_token')
  );
  const [error, setError] = useState<Error | null>();
  const [user, setUser] = useState<any>();
  const [haveCalendarApi, setHaveCalendarApi] = useState(false);
  const [
    calendars,
    setCalendars,
  ] = useState<gapi.client.calendar.CalendarList | null>();
  const onSuccess = useCallback(
    (response: GoogleLoginResponse | GoogleLoginResponseOffline) => {
      if (!('tokenId' in response)) {
        return;
      }
      console.log('response: ', response);
      window.localStorage.setItem('gapi_token', response.tokenId);
      setUser(response.profileObj);
    },
    []
  );

  useEffect(() => {
    async function refresh() {
      try {
        console.log('loading calendar..');
        await loadCalendarApi();
        console.log('have calendar');
        setHaveCalendarApi(true);
      } catch (ex) {
        console.log('failed to get calendar');
      }
    }
    if (user) {
      refresh();
    }
  }, [user]);

  const onFailure = useCallback((response) => {
    console.log('failure: ', response);
    setError(response);
  }, []);

  const onLogout = useCallback(() => {
    setGapiToken(null);
    setUser(null);
    window.localStorage.removeItem('gapi_token');
  }, []);
  const onLoadCalendar = useCallback(async () => {
    const calendars = await gapi.client.calendar.calendarList.list();
    setCalendars(calendars.result);
  }, []);

  const [
    events,
    setEvents,
  ] = usePersistentState<gapi.client.calendar.Events | null>(
    'current_events',
    null
  );

  const loadEvents = useCallback(
    async (calendarId: string) => {
      const calendarEvents = await gapi.client.calendar.events.list(
        makeCalendarListQuery(calendarId)
      );
      setEvents(calendarEvents.result);
    },
    [setEvents]
  );

  const time = useCurrentTime();

  const { current, future } = useMemo(() => {
    const now = time.toISOString();

    const futureEvents =
      events?.items
        ?.map((event): CustomEvent | null => {
          const { start, end } = event;
          const eventStart = new Date(start?.dateTime ?? '');
          const startDateTime = eventStart.toISOString();
          const eventEnd = new Date(end?.dateTime ?? '');
          const endDateTime = eventEnd.toISOString();

          const ended = now > endDateTime;
          if (ended || eventStart.getDay() !== time.getDay()) {
            return null;
          }

          const happeningNow = startDateTime <= now && now < endDateTime;
          const pending = !happeningNow ? endDateTime > now : false;

          const secondsLeft = Math.floor(
            (eventEnd.valueOf() - time.valueOf()) / 1000
          );

          return {
            ...event,
            happeningNow,
            pending,
            secondsLeft,
            ago: ago(eventStart),
          };
        })
        .filter(notEmpty) ?? [];
    const [current, future] = _.partition(
      futureEvents,
      (event) => event.happeningNow
    );
    // console.log('current = ', current);
    // console.log('future = ', future);
    return { current, future: future.slice(0, 3) };
  }, [events, time]);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.time}>{time?.toLocaleTimeString()}</h1>
        {error && (
          <div>
            Error:{' '}
            <pre style={{ fontSize: '12px' }}>{JSON.stringify(error)}</pre>
          </div>
        )}
        {calendars && (
          <ul>
            {calendars.items?.map((calendar) => (
              <li key={calendar.id}>
                <button onClick={() => loadEvents(calendar.id ?? '')}>
                  {calendar.summary}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!!current?.length && (
          <div>
            <h2 className={styles.timeHeader}>Right now</h2>

            <ul>
              {current.map((event) => (
                <EventBanner key={event.id} event={event} />
              ))}
            </ul>
          </div>
        )}
        {!!future?.length && (
          <div>
            <h2 className={styles.timeHeader}>Coming up</h2>
            <ul>
              {future.map((event) => (
                <EventBanner key={event.id} event={event} />
              ))}
            </ul>
          </div>
        )}
        <div>
          {user && <div>User: {user.name}</div>}
          <GoogleLogin
            clientId={clientId}
            buttonText="Login"
            render={(renderProps) =>
              user ? (
                <button {...renderProps} disabled={haveCalendarApi}>
                  Login please
                </button>
              ) : (
                <span />
              )
            }
            onSuccess={onSuccess}
            onFailure={onFailure}
            isSignedIn
            uxMode="redirect"
            scope={calendarScope}
          />
          {gapiToken && (
            <GoogleLogout clientId={clientId} onLogoutSuccess={onLogout} />
          )}
          <button onClick={onLoadCalendar} disabled={!haveCalendarApi}>
            Load calendar
          </button>
        </div>
      </header>
    </div>
  );
};

export default App;

const loadTime = new Date();
const EventBanner: FunctionComponent<{ event: CustomEvent }> = ({ event }) => {
  const colorClass = classNames(
    {
      [styles.now]: event.happeningNow,
      [styles.soon]: event.secondsLeft < ONE_HOUR,
      [styles.imminent]: event.secondsLeft < 5 * ONE_MINUTE,
    },
    styles.banner
  );

  const start = format(new Date(event.start?.dateTime ?? ''), 'h:mm');
  const left = ago(new Date(event.end?.dateTime ?? ''));
  return (
    <li key={event.id} className={colorClass}>
      {event.summary} {event.pending ? event.ago : null}
      {event.pending && ` @ ${start}`}
      <div className={styles.note}>
        {event.happeningNow && ` ending ${left}`}
      </div>
    </li>
  );
};

function useCurrentTime() {
  const [time, setTime] = useState<Date>(loadTime);
  const onFrame = useCallback(() => {
    setTime(new Date());
  }, []);
  useAnimationFrame(1000, onFrame);
  return time;
}

function loadCalendarApi() {
  return new Promise((resolve, reject) => {
    gapi.load('client', async () => {
      try {
        gapi.client.init({
          apiKey,
          clientId,
          discoveryDocs: [
            'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
          ],
          scope: calendarScope,
        });
        await retry(() => !!gapi.client.calendar, 200);
        console.log('have calendar api');
        resolve(null);
      } catch (ex) {
        console.error('Error loading calendar', ex);
        reject(ex);
      }
    });
  });
}

/** Keep retrying a function until it returns true */
function retry(fn: () => boolean, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    let loaded = false;
    function tryload() {
      loaded = fn();
      if (loaded) {
        resolve();
        return;
      }
      console.log('not loaded...waiting', timeoutMs);
      setTimeout(tryload, timeoutMs);
    }
    tryload();
  });
}

function makeCalendarListQuery(calendarId: string) {
  console.log('filtering by ', new Date().toISOString());
  return {
    calendarId,
    timeMin: new Date().toISOString(),
    showDeleted: false,
    singleEvents: true,
    maxResults: 10,
    orderBy: 'startTime',
  };
}
function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}
