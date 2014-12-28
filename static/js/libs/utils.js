define(["jquery"],function($){
	var utils = {
		self: this,
		createSimpleDialog: function(id){
			$(id).html('aaaa');
		},
		toHtml: function(f){
			return f.toString().replace(/^[^\/]+\/\*!?\s?/, '').replace(/\*\/[^\/]+$/, '');
		}
	};
	return utils;
})