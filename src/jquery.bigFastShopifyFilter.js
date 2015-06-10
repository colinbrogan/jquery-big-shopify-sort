// the semi-colon before function invocation is a safety net against concatenated
// scripts and/or other plugins which may not be closed properly.
;(function ( $, window, document, undefined ) {

	"use strict";

		// undefined is used here as the undefined global variable in ECMAScript 3 is
		// mutable (ie. it can be changed by someone else). undefined isn't really being
		// passed in so we can ensure the value of it is truly undefined. In ES5, undefined
		// can no longer be modified.

		// window and document are passed through as local variable rather than global
		// as this (slightly) quickens the resolution process and can be more efficiently
		// minified (especially when both are regularly referenced in your plugin).

		// Create the defaults once
		var pluginName = "bigFastShopifyFilter",
				defaults =  {
					filter_criteria: null,
					collection_handle: null,
					paginate: 20,
					key_value_overrides: null,
					metafields: null,
					tagfields: null,
					price: {
							enable: true,
							ui_label: "Price",
							ui_component: "range-slider",
							placement: "sidebar",
							range_splits: 4
					},
					vendor: {
							enable: true,
							ui_component: "sidebar",
							placement: "sidebar",
							one_option_hide: true,
					},
					type: {
							enable: true,
							ui_component: "checkbox-button-group",
							placement: "sidebar",
							one_option_hide: true,
					},
		};

		// The actual plugin constructor
		function Plugin ( element, options ) {
				this.element = element;
				// jQuery has an extend method which merges the contents of two or
				// more objects, storing the result in the first object. The first object
				// is generally empty as we don't want to alter the default options for
				// future instances of the plugin
				this.settings = $.extend( {}, defaults, options );
				this._defaults = defaults;
				this._name = pluginName;
				this.init();
		}

		/******* Private Member Variables go here *****/
		var privateInfo = null;

		/******* Private Methods go here ******/


		// Avoid Plugin.prototype conflicts
		$.extend(Plugin.prototype, {
				init: function () {
						// Place initialization logic here
						// You already have access to the DOM element and
						// the options via the instance, e.g. this.element
						// and this.settings
						// you can add more functions like the one below and
						// call them like so: this.yourOtherFunction(this.element, this.settings).

						if($(this.element).data("collection") !== undefined) {
							this.setCollectionHandle($(this.element).data("collection"));
						} else {
							return false;
						}
						/*** Retrieve data attached to instance and act appropriately */
						var fastStart = $(this.element).find("ul.product-grid").data("fast-start");
						if(fastStart !== undefined) {
							var load = fastStart;
							this.storeAllReceived(load);
						}
						/****** custom events go here ******/
						var thePrototypeExtension = this;
						$(this.element).on("loadReceived",function(event,load) {
							console.log("loadReceived");
							thePrototypeExtension.storeAllReceived(load);
							thePrototypeExtension.filter();
						});
						
				},
				/********** instance variables  ****************/
				filtered: {},
				filter_options: {},
				allReceived: {},
				displayEndIndex: 0,
				collection_handle: null,
				filter_criteria: null,
				load_complete: false,
				sort_property: "price",
				$queuedForScroll: $(),
				$productGrid: $(),
				page: 1,
				/********** public Methods ***************/
				go: function(params) {
					$(this.element).find("ul.product-grid").empty();
					console.log("go fired");
					this.filter_criteria = params;
					var $theElement = $(this.element);
					this.filter();
					if(this.load_complete === false) {
						var doWithEachLoad = function(load) {
							$theElement.trigger("loadReceived",load);
						};
						Shopify.Mazer.pipeInCollection.go(this.collection_handle,doWithEachLoad);
					} else {
					}
				},
				filter: function() {
					this.filtered = {};
					/* loop through every product of this collection */
					for(var handle in this.allReceived) {
						/* leave determines whether or not a product matches all parameters and should be displayed, it begins as true. The idea being, if any current sort parameter doesn't match to the product, the product is discarded. This seems to me be the fastest means of narrowing down a listing */
						var toFiltered = true;
						/* check every url filter criteria passed */
						for(var criteria in this.filter_criteria) {
							var current_criteria_value = decodeURIComponent(this.filter_criteria[criteria]);
							if(this.settings.metafields.hasOwnProperty(criteria)) {
								for(var metafield in this.allReceived[handle].metafields) {
									var current_metafield_value = this.allReceived[handle].metafields[metafield];
									if(metafield === criteria) {
										if(current_metafield_value === current_criteria_value) {
											/* do nothing */
										} else {
											toFiltered = false;
										}
									}
								}
								
							} else if(this.settings.tagfields.hasOwnProperty(criteria)) {
								for (var tag in this.allReceived[handle].info.tags) {
									var tagPreValue = this.allReceived[handle].info.tags[tag];
									if (tagPreValue.indexOf("kvp:"+criteria) === 0) {
										var splitFields = tagPreValue.split(":");
										var field_name = splitFields[1];
										var field_value = splitFields[2];
										if(field_name === criteria) {
											if(current_criteria_value === field_value) {
												/* do nothing */
											} else {
												toFiltered = false;
											}
										}

									}
								}
							}
						}
						if(toFiltered) {
							this.filtered[handle] = this.allReceived[handle];
						}
						
					}
					this.trickleToGrid();
				},
				storeAllReceived: function(load) {
					if(this.allReceived == null) {
						this.allReceived = {};
					}
					for (var handle in load.products) {
						for (var metafield in load.products[handle].metafields) {
							var metafield_value = load.products[handle].metafields[metafield];
							// Make sure this is a filterable property
							if(this.settings.metafields.hasOwnProperty(metafield)) {
								// Do not go further if this option already has a value, prevents 
								// repetitive calculations
								if(this.filter_options.hasOwnProperty(metafield)) {
									if(this.filter_options[metafield].hasOwnProperty(metafield_value)) {
										break;
									} else {
										this.filter_options[metafield][metafield_value] = {};
									}
								} else {
									this.filter_options[metafield] = {};
									this.filter_options[metafield][metafield_value] = {};
								}
										// determine whether or not the filter option has custom information
										// defined in theme options
										if(this.settings.filter_values.hasOwnProperty(metafield)) {

											// Flush out custom labels, colors and images, 
											// if defined in the theme options.

											if(this.settings.filter_values[metafield].hasOwnProperty(metafield_value)) {

												var option_label = this.settings.filter_values[metafield][metafield_value].label;
												var option_color = this.settings.filter_values[metafield][metafield_value].color;
												var option_image = this.settings.filter_values[metafield][metafield_value].image;
												if(option_label) {
													this.filter_options[metafield][metafield_value].label = option_label;
												} else {
													this.filter_options[metafield][metafield_value].label = metafield_value;
												}
												if(option_color) {
													this.filter_options[metafield][metafield_value].color = option_color;
												}
												if(option_image) {
													this.filter_options[metafield][metafield_value].image = option_image;
												}

											} else {

												// if field value not defined in theme settings,
												// add value as title
												this.filter_options[metafield][metafield_value].label = metafield_value;
											}
										} else {

											// if field name not defined in theme settings,
											// add value as title
											this.filter_options[metafield][metafield_value].label = metafield_value;
										}
							}
						}
						for (var tag in load.products[handle].info.tags) {
							var tagPreValue = load.products[handle].info.tags[tag];
							if (tagPreValue.indexOf("kvp:") === 0) {
								var splitFields = tagPreValue.split(":");
								var field_name = splitFields[1];
								var field_value = splitFields[2];
								// Make sure this is a filterable property
								if(this.settings.tagfields.hasOwnProperty(field_name)) {

									// Do not go further if this option already has a value, prevents 
									// repetitive calculations
									if(this.filter_options.hasOwnProperty(field_name)) {
										if(this.filter_options[field_name].hasOwnProperty(field_value)) {
											break;
										} else {
											this.filter_options[field_name][field_value] = {};
										}
									} else {
										this.filter_options[field_name] = {};
										this.filter_options[field_name][field_value] = {};
									}
											// determine whether or not the filter option has custom information
											// defined in theme options
											if(this.settings.filter_values.hasOwnProperty(field_name)) {

												// Flush out custom labels, colors and images, 
												// if defined in the theme options.
												if(this.settings.filter_values[field_name].hasOwnProperty(field_value)) {
													var option_label = this.settings.filter_values[field_name][field_value].label;
													var option_color = this.settings.filter_values[field_name][field_value].color;
													var option_image = this.settings.filter_values[field_name][field_value].image;
													if(option_label) {
														this.filter_options[field_name][field_value].label = option_label;
													} else {
														this.filter_options[field_name][field_value].label = field_value;
													}
													if(option_color) {
														this.filter_options[field_name][field_value].color = option_color;
													}
													if(option_image) {
														this.filter_options[field_name][field_value].image = option_image;
													}

												} else {

													// if field value not defined in theme settings,
													// add value as title
													this.filter_options[field_name][field_value].label = field_value;
												}
											} else {

												// if field name not defined in theme settings,
												// add value as title
												this.filter_options[field_name][field_value].label = field_value;
											}

								}
							}
						}
						this.allReceived[handle] = load.products[handle];
					}
				},
				renderOptions: function() {
					var return_string = "";
					for(var option in this.filter_options) {
						return_string += "<h3>"+option.toUpperCase()+"</h3>";
						return_string += "<ul class=\"tick-boxes\">";
						for(var value in this.filter_options[option]) {
							var valueObject = this.filter_options[option][value];
							var active_string = "";
							if(this.filter_criteria.hasOwnProperty(encodeURIComponent(option))) {
								if(this.filter_criteria[option] == encodeURIComponent(value)) {
									active_string += "active";
								}
							}
							var background_string = "";
							if(valueObject.color) {
								background_string += "background-color: "+valueObject.color;
							}
							if(valueObject.image) {
								background_string += "; background-image: url("+valueObject.image+");";
							}
							return_string += "<li><button class=\""+active_string+"\" name=\""+option+"\" value=\""+value+"\"><div class=\"tick-box\" style=\""+background_string+"\"></div>"+valueObject.label+"</button></li>";
						}
						return_string += "</ul>";
					}
					return return_string;
				},
				getAllReceived: function() {
					return this.allReceived;
				},
				trickleToGrid: function() {
					var theCollectionHandle = this.collection_handle;
					console.log("theCollectionHandle");
					console.log(theCollectionHandle);
					var renderTemplate = function(product) {
						var kvp = {};
						for(var tagI in product.info.tags) {
							var tag = product.info.tags[tagI];
							if(tag.indexOf("kvp:") === 0) {
								var tagsplit = tag.split(":");
								kvp[tagsplit[1]] = tagsplit[2];
							}
						}
						var condition = "";
						switch(product.metafields.Condition) {
							case "S&D":
								condition = "Scratch & Dent";
								break;
							case "NITB":
								condition = "New In Box";
								break;
							case "SO":
								condition = "Special Order";
								break;
							case "CO":
								condition = "Closeout";
								break;
						}
						var image_string = "";
						if(product.info.vendor == "LG") {
							image_string = '<img src="'+product.info.images[0].replace(".jpeg","_medium.jpeg")+'" class="'+product.info.vendor+'" alt="" />';

						} else if(product.info.vendor == "GE") {
							image_string = '<img src="'+product.info.images[0].replace(".jpeg","_small.jpeg")+'" class="'+product.info.vendor+'" alt="" />';

						}
						return [
							"<li id='p"+product.info.id+"' class='"+product.metafields.Condition.toLowerCase().replace("&","")+"'>",
								'<div class="snapshot">',
									'<a href="/collections/'+theCollectionHandle+'/products/'+product.info.handle+'" class="product-image">',
										image_string,
									'</a>',
									'<dl class="specs">',
										'<div class="spec-wrap">',
											'<dt>MODEL</dt>',
											'<dd>'+product.info.handle.split('-')[0]+'</dd>',
										'</div>',
										'<div class="spec-wrap">',
											'<dt>SERIAL</dt>',
											'<dd>'+product.info.handle.split('-')[1]+'</dd>',
										'</div>',
										'<div class="spec-wrap">',
											'<dt>CAPACITY</dt>',
											'<dd>'+kvp["Total Capacity (cubic feet)"]+'</dd>',
										'</div>',
										'<div class="spec-wrap">',
											'<dt>LOCATION</dt>',
											'<dd>'+product.metafields.Location+'</dd>',
										'</div>',
										'<div class="spec-wrap long">',
											'<dt>DIMENSIONS</dt>',
											'<dd>'+kvp["Overall Width"]+'"W x '+kvp["Overall Height"]+'"H x '+kvp["Overall Depth"]+'"D</dd>',
										'</div>',
									'</dl>',
								'</div>',
					            '<div class="price-condition">',
					                '<dl class="price">',
					                	'<dt><span hidden>Price</span></dt>',
					                	'<dd>$'+product.info.price/100+'</dd>',
					                '</dl>',
					                '<div class="count-breakout">',
					                	'<div>',
						                    '<span class="tag-count '+product.metafields.Condition.replace("&", "").toLowerCase()+'">',
						                    	condition,
						                    '</span>',
					                  	'</div>',
					                '</div>',
					            '</div>',
					            '<h4 class="product-title"><a href="/collections/'+theCollectionHandle+'/products/'+product.info.handle+'">'+product.info.title+'</a></h4>',
					            '</li>',
						].join("");
					};
/*					var pGridIndex = 0;				*/
					var thePrototypeExtension = this;
					var paginateCount = 0;
					var sortedAdd = function($productHouser,$productInsert,cap) {
						var add_to_next = false;
						var placed_item = false;
						if($productHouser.find("li").length > 0) {
							var pg_loop = function(pg_index) {

								if($(this).data("json").info.id == thePrototypeExtension.filtered[handle].info.id) {
									placed_item = true;
									console.log(0);
									return false;
								} else if(thePrototypeExtension.filtered[handle].info[thePrototypeExtension.sort_property] < $(this).data('json').info[thePrototypeExtension.sort_property]) {
									$(this).before($productInsert);
									paginateCount++;
									if($productHouser.find("li").length > cap) {
										var $stray_item = $productHouser.find("li:last-child");
										add_to_next = $stray_item.clone();
										$stray_item.remove();
									}
									placed_item = true;
									console.log(1);
									return false;
								} else if(pg_index == $productHouser.find("li").length - 1 && pg_index < (cap - 1)) {
									$(this).after($productInsert);
									paginateCount++;
									placed_item = true;
									console.log(2);
									return false;
								}
							};
							$productHouser.find("li").each(pg_loop);
						} else {
							$productHouser.append($productInsert);
							placed_item = true;
							console.log(3);
						}
						return {
							placed_item: placed_item,
							add_to_next: add_to_next
						};
					};
					for(var handle in this.filtered) {
						var $productInsert = $(renderTemplate(this.filtered[handle])).data('json',this.filtered[handle]);
						var $productGrid = $("ul.product-grid");
						// Choose where to put the product
						var cap = this.settings.paginate*this.page;
						var results = sortedAdd($productGrid,$productInsert,cap);
						if(results.add_to_next) {
							console.log("results.add_to_next");
							console.log(results.add_to_next);
							this.$queuedForScroll.prepend(results.add_to_next);
						}
						if(!results.placed_item) {
							console.log("sortAdd on queuedForScroll");
							this.$queuedForScroll.add($productInsert);
//							sortedAdd(this.$queuedForScroll,$productInsert,10000);
						}

					}
					console.log("queuedForScroll");
					console.log(this.$queuedForScroll);
					$(this.element).find("#options-go-here").empty();
					$(this.element).find("#options-go-here").append(this.renderOptions());
					this.registerActions();
				},
				registerActions: function() {
					$("ul.tick-boxes button").click(function(event) {
						event.preventDefault();
						var field_name = $(this).attr("name");
						var field_value = $(this).attr("value");
						$.address.parameter(field_name,encodeURIComponent(field_value),false);
					});
				},
				refresh: function() {
					console.log("refresh");
					somePrivateMethod("refresh");
				},

				/********* Public Setters ****************/
				setCollectionHandle: function(collection_handle) {
					this.collection_handle = collection_handle;
				},
				/********* Public Getters ****************/
				getSomeInfo: function() {
					return this.someInfo;
				},

				/********** Public Getters of Private Info ***************/
				getPrivateInfo: function() {
					return privateInfo;
				}

		});

		// A really lightweight plugin wrapper around the constructor,
		// preventing against multiple instantiations
		$.fn[ pluginName ] = function ( options ) {


				var args = arguments;

		        // Is the first parameter an object (options), or was omitted,
		        // instantiate a new instance of the plugin.
		        if (options === undefined || typeof options === "object") {
		            return this.each(function () {

		                // Only allow the plugin to be instantiated once,
		                // so we check that the element has no plugin instantiation yet
		                if (!$.data(this, "plugin_" + pluginName)) {

		                    // if it has no instance, create a new one,
		                    // pass options to our plugin constructor,
		                    // and store the plugin instance
		                    // in the elements jQuery data object.
		                    $.data(this, "plugin_" + pluginName, new Plugin( this, options ));
		                }
		            });

		        // If the first parameter is a string and it doesn"t start
		        // with an underscore or "contains" the `init`-function,
		        // treat this as a call to a public method.
		        } else if (typeof options === "string" && options[0] !== "_" && options !== "init") {

		            // Cache the method call
		            // to make it possible
		            // to return a value
		            var returns;

		            this.each(function () {
		                var instance = $.data(this, "plugin_" + pluginName);

		                // Tests that there"s already a plugin-instance
		                // and checks that the requested public method exists
		                if (instance instanceof Plugin && typeof instance[options] === "function") {

		                    // Call the method of our plugin instance,
		                    // and pass it the supplied arguments.
		                    returns = instance[options].apply( instance, Array.prototype.slice.call( args, 1 ) );
		                }

		                if (options === "destroy") {
		                  $.data(this, "plugin_" + pluginName, null);
		                }
		            });

		            // If the earlier cached method
		            // gives a value back return the value,
		            // otherwise return this to preserve chainability.
		            return returns !== undefined ? returns : this;
		        }
		};

})( jQuery, window, document );