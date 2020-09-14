import './App.css';

import React, { FunctionComponent, useCallback, useState } from 'react';
import GoogleLogin, { GoogleLogout } from 'react-google-login';

const clientId = process.env.REACT_APP_CLIENT_ID ?? '';
const apiKey = 'AIzaSyD01PlE0xERSwpZQauir8ZisF5e7LuNAbo';

const App: FunctionComponent = () => {
  const [gapiToken, setGapiToken] = useState(
    window.localStorage.getItem('gapi_token')
  );
  const [error, setError] = useState<Error | null>(null);
  const [user, setUser] = useState<any>(null);

  const onSuccess = useCallback((response) => {
    console.log('response: ', response);
    window.localStorage.setItem('gapi_token', response.tokenId);
    setUser(response.profileObj);
    gapi.load('client', async (response) => {
      console.log('loading client...', gapi.client);
      console.log('have calendar: ', !!(gapi.client as any).calendar);
      try {
        await gapi.client.init({
          apiKey,
          clientId,
          discoveryDocs: [
            'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
          ],
          scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
        });

        console.log('calendar loaded!');
        console.log('loading calendar from ', (gapi.client as any)['calendar']);
        (gapi.client as any).calendar.events
          .list({
            calendarId: 'primary',
            timeMin: new Date().toISOString(),
            showDeleted: false,
            singleEvents: true,
            maxResults: 10,
            orderBy: 'startTime',
          })
          .then((response: any) => {
            console.log('got events: ', response.result.items);
          });
      } catch (ex) {
        console.error('EX');
      }
    });
  }, []);

  const onFailure = useCallback((response) => {
    console.log('failure: ', response);
    setError(response);
  }, []);

  const onLogout = useCallback(() => {
    setGapiToken(null);
    setUser(null);
    window.localStorage.removeItem('gapi_token');
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <p>Time will go? here</p>
        {error && (
          <div>
            Error:{' '}
            <pre style={{ fontSize: '12px' }}>{JSON.stringify(error)}</pre>
          </div>
        )}
        {user && <div>User: {user.name}</div>}
        <GoogleLogin
          clientId={clientId}
          buttonText="Login"
          render={(renderProps) => (
            <button {...renderProps}>Login please</button>
          )}
          onSuccess={onSuccess}
          onFailure={onFailure}
          isSignedIn
          uxMode="redirect"
          scope="https://www.googleapis.com/auth/calendar.readonly"
        />
        {gapiToken && (
          <GoogleLogout clientId={clientId} onLogoutSuccess={onLogout} />
        )}
      </header>
    </div>
  );
};

export default App;
