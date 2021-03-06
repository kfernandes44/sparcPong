angular
	.module('directives')
	.directive('loggedIn', loggedIn);

loggedIn.$inject = ['$rootScope'];

function loggedIn($rootScope) {

	return {
		link: function(scope, elem, attrs) {
			$rootScope.$watch('myClient.playerId', function(playerId) {
				if (playerId) {
					var checkIds = scope.$eval(attrs.loggedIn);
					// Someone is logged in
					if (checkIds) {
						// Requested a certain user
						if (inArray(playerId, checkIds))
							elem.show();
						else
							elem.hide();
					} else {
						// Any user will do
						elem.show();
					}
				} else {
					// No one is logged in
					elem.hide();
				}
			});
		}
	};
	
	function inArray(needle, arr) {
		// This happens when a single parameter is passed in
		if (typeof arr === 'string') {
			arr = [arr];
		}
		
		for (var i=0; i<arr.length; i++) {
			if (needle == arr[i])
				return true;
		}
		return false;
	}

}
