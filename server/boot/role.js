let moment = require('moment');

module.exports = (app) => {
	let Role = app.models.Role;
	// customer owner role resolver.
	Role.registerResolver('$token', (role, ctx, cb) => {
		let headers = ctx.remotingContext.req.headers;

		if(!headers.hasOwnProperty('authorization')) {
			return process.nextTick(() => cb(null, false));
		}

		let AuthToken = headers.authorization;

		if(!AuthToken) {
            return process.nextTick(() => cb(null, false));
		}

		if(AuthToken === process.env.AUTH_TOKEN) {
			return cb(null, true);
		}

        return cb(null, false);
	});
}
