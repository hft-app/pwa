﻿class Controller {
	
	// IDB table definition
	get tables() {
		return {
			exams: { autoIncrement: true },
			meals: { autoIncrement: true },
			lectures: { autoIncrement: true },
			events: { keyPath: 'id' }, // Needed for event export
			professors: { autoIncrement: true },
			tips: { autoIncrement: true },
			printers: { autoIncrement: true },
			subjects: { autoIncrement: true },
			server: {},
		};
	}
	
	// Cache definition
	get cachedFiles() {
		return [
			'/font/awesome.woff2?v=4.7.0',
			'/font/awesome.woff?v=4.7.0',
			
			'/script/client/courses.js',
			'/script/client/insight.js',
			'/script/client/lu.min.js',
			'/script/client/menu.js',
			'/script/client/professors.js',
			'/script/client/shell.js',
			
			'/style/main.scss',
			'/style/login.scss',
			'/style/error.scss',
			
			'/lang/de.json',
			
			'/template/event.ics',
			
			'/template/_courses.html',
			'/template/_events.html',
			'/template/_exams.html',
			'/template/_welcome.html',
			'/template/_lectures.html',
			'/template/_meals.html',
			'/template/_menu.html',
			'/template/_printers.html',
			'/template/_professors.html',
			'/template/_tips.html',
			'/template/error.html',
			'/template/shell.html',
			'/template/login.html',
			
			'/launcher/meta.html',
		];
	}
	
	// Errors (internal error pages)
	get errors() {
		return {
			InvalidDevice: {},
			InvalidCredentials: {},
		};
	}
	
	// Constructor
	constructor(version) {
		this.cacheVersion = version;
		
		// Setup server
		this.server = 'https://server.hft-app.de/';
		
		// Setup handlers
		this.requestHandlers = [
			new LaunchHandler(this),
			new CoreHandler(this),
			new AuthHandler(this),
			new EventHandler(this),
		];
	
		// Connect to DB
		IDB.open(this.tables);
	}
	
	// Exception handler
	async exceptionHandler(exception) {
		console.log('internal exception: ' + exception);
		
		const error = this.errors[exception];
		if(!error) throw exception;
		
		/* TODO: always carry a 'session'-attribute in API calls, logout if false in regular request routine */
		if(['InvalidDevice', 'InvalidCredentials'].includes(exception)) await this.logout();
		
		const template = await this.fetch('/template/error.html').then(response => response.text());
		return this.wrap(Elements.render(template, error));
	}
	
	// Response filter
	async responseFilter(response) {
		
		// Return native response
		if(response instanceof Response) return response;
		
		// Return html wrapped in response
		if(response) {
			const language = await this.fetch('/lang/de.json').then(response => response.json());
			const translated = new Elements({open: '[[', close: ']]'}).render(response, language);
			return this.wrap(translated);
		}
		
		// Return error
		return Response.error();
	}
	
	// Refresh data
	async refresh() {
		
		// Perform request
		const result = await this.query('refresh');
		
		// Clear all tables but server
		for(let name in this.tables) {
			if(name == 'server') continue;
			await IDB[name].clear();
			
			// Refill tables
			if(result[name]) for(let object of result[name]) {
				
				// Cast date objects
				for(let index in object) if((
					(name == 'lectures' && index == 'start') ||
					(name == 'lectures' && index == 'end') ||
					(name == 'events' && index == 'start') ||
					(name == 'events' && index == 'end')
				) && object[index]) object[index] = new Date(object[index]);
				
				// Insert data
				await IDB[name].put(object);
			}
		}
	}
	
	/* Fetch a resource
	 * App resouces are requested by their relative path in the repository, e.g. /template/core.html
	 * Therefore they cannot be served from network when inside the launcher.
	 * But they can be served from cache, as the launcher stores them with the appropriate (fake) path.
	 * It has to be ensured that all app resources are cached and other requests like API calls use absolute paths.
	 */
	async fetch(request) {
		return await caches.match(request) || await fetch(request);
	}
	
	// Query API
	async query(action, data) {
		
		// Check connection
		if(!navigator.onLine) throw 'offline';
		
		// Add device
		if(!data) data = new URLSearchParams();
		data.set('device', await IDB.server.get('device'));
		
		// Perform request
		const response = await fetch(this.server+'api.php?action='+action, {
			method: 'POST',
			body: data,
		}).then(response => response.json());
		
		// Check response
		if(response.status && response.status == 'OK') return response;
		else throw response.error || 'unknown error';
	}
	
	// Wrap up html in response
	async wrap(html) {
		return new Response(html, {
			status: 200,
			statusText: 'OK',
			headers: new Headers({
				'Content-Type': 'text/html;charset=UTF-8',
				'Content-Length': html.length,
			}),
		});
	}
	
	// Perform logout
	async logout() {
		for(const table in this.tables) IDB[table].clear();
	}
}