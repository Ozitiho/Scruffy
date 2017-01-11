let moment = require('moment');

module.exports = (app) => {
	let Role = app.models.Role;
	// customer owner role resolver.
	Role.registerResolver('$token', (role, context, cb) => {
		let AuthHeader = ctx.res.getHeader('Authorization');

		if(!AuthHeader) {
            return process.nextTick(() => cb(null, false));
		}

		let Token = app.models.Token;
		Token.findOne({
			where: {
				token: authHeader,
				expires: {
					lt: moment()
				}
			}
		})
		.then(result => {
			if(!result) {
	            return process.nextTick(() => cb(null, false));
			}


            return cb(null, true);
		})
	});
}
