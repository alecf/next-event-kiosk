import './App.css';
import _ from 'lodash';
import ago from 's-ago';
import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import GoogleLogin, {
  GoogleLoginResponse,
  GoogleLogout,
  GoogleLoginResponseOffline,
} from 'react-google-login';
import { useAnimationFrame } from './useAnimationFrame';
import { usePersistentState } from './usePersistentState';

const clientId = process.env.REACT_APP_CLIENT_ID ?? '';
const apiKey = 'AIzaSyD01PlE0xERSwpZQauir8ZisF5e7LuNAbo';

const calendarScope =
  'https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.readonly';
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
        ?.map((event) => {
          const { start, end } = event;
          const startDateTime = start?.dateTime ?? '';
          const endDateTime = end?.dateTime ?? '';
          const happeningNow = startDateTime < now && endDateTime > now;
          const pending = !happeningNow ? startDateTime > now : false;
          if (!start || !(happeningNow || pending)) {
            return null;
          }
          const secondsLeft =
            (new Date(startDateTime).valueOf() ?? 0) - time.valueOf();
          const eventTime = new Date(startDateTime);
          return {
            ...event,
            happeningNow,
            pending,
            secondsLeft,
            ago: ago(eventTime),
          };
        })
        .filter(notEmpty) ?? [];
    const [current, future] = _.partition(
      futureEvents,
      (event) => event.happeningNow
    );
    return { current, future };
  }, [events, time]);

  return (
    <div className="App">
      <header className="App-header">
        <p>Time will go? here: {time?.toLocaleTimeString()}</p>
        {error && (
          <div>
            Error:{' '}
            <pre style={{ fontSize: '12px' }}>{JSON.stringify(error)}</pre>
          </div>
        )}
        {user && <div>User: {user.name}</div>}
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
        {current && (
          <div>
            <h2>Right now</h2>

            <ul>
              {current.map((event) => (
                <li key={event.id}>
                  {event.summary}
                  {event.happeningNow ? '(now)' : null}
                  {event.pending ? event.ago : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        {future && (
          <div>
            <h2>Future</h2>
            <ul>
              {future.map((event) => (
                <li key={event.id}>
                  {event.summary}
                  {event.happeningNow ? '(now)' : null}
                  {event.pending ? event.ago : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        <GoogleLogin
          clientId={clientId}
          buttonText="Login"
          render={(renderProps) => (
            <button {...renderProps} disabled={haveCalendarApi}>
              Login please
            </button>
          )}
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
      </header>
    </div>
  );
};

export default App;

const loadTime = new Date();
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

function makeCalendarListQuery(calendarId: string): any {
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
