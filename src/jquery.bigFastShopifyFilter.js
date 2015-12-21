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
					paginate: 30,
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
						// this.settings.type.enable
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
							console.log("A load was received");
							thePrototypeExtension.storeAllReceived(load);
							if((load.page - 1) % 7 == 0) {
								thePrototypeExtension.filter();
								thePrototypeExtension.buildOptions();
							}
						});
						$(this.element).on("loadsFinished",function(event) {
							console.log("Finished all Loads");
							thePrototypeExtension.buildOptions();
							thePrototypeExtension.filter();

							$("#options-go-here").removeClass("loading");
						});
						$(this.element).on("filterOptionsChanged",function(event) {
							thePrototypeExtension.setActiveOptionsToHash();
						});
						
				},
				/********** instance variables  ****************/
				filtered: {},
				filter_options: {},
				allReceived: {},
				displayEndIndex: 0,
				collection_handle: null,
				filter_criteria: null,
				all_loads_in: false,
				sort_property: "price",
				queuedForScroll: [],
				$productGrid: $(),
				scroll_adding: false,
				page: 1,
				/********** public Methods ***************/
				go: function(params) {
					$(this.element).find("ul.product-grid").empty();
					this.queuedForScroll = [];
					this.filter_criteria = params;
					var $theElement = $(this.element);
					this.filter();
					this.buildOptions();
					this.sendGAEvents(params);
					if(this.all_loads_in === false) {
						var doWithEachLoad = function(load) {
							$theElement.trigger("loadReceived",load);
						};
						var thePrototypeExtension = this;
						var whenDone = function(response) {
							thePrototypeExtension.all_loads_in = true;
							var filteredEmpty = true;
							for(var i in thePrototypeExtension.filtered) {
								filteredEmpty = false;
								break;
							}
							if(filteredEmpty) {
								$('ul.product-grid').html([
									"<li class='emtpy-message'>",
										"Nothing matched your filter criteria.",
										"<a href='#' class='clear-all'>",
										"Clear All <i class='icon icon-close'></i>",
										"</a>",
									"</li>",
									].join("")
								);	
							}
							$theElement.trigger("loadsFinished",response);

						};
						Shopify.Mazer.pipeInCollection.go(this.collection_handle,doWithEachLoad,1,whenDone);
					}
				},
				sendGAEvents: function(params) {
					console.log('sendGAEvents!');
					for(var key in params) {
						console.log("ga('send', 'event', 'Filtering Collection with', '"+key+": "+params[key]+"');");
						ga('send', 'event', 'Filtering Collection with', key+": "+params[key]);
					}
				},
				fastReload: function(params) {
					$(this.element).find("ul.product-grid").empty();
					this.queuedForScroll = [];
					this.filter_criteria = params;
					var $theElement = $(this.element);
					this.filter();
					this.sendGAEvents(params);

				},
				filter: function() {
					$(this.element).find("ul.product-grid").addClass("loading");
					this.filtered = {};
					/* loop through every product of this collection */
					for(var handle in this.allReceived) {
						/* leave determines whether or not a product matches all parameters and should be displayed, it begins as true. The idea being, if any current sort parameter doesn't match to the product, the product is discarded. This seems to me be the fastest means of narrowing down a listing */
						var toFiltered = true;

						// go ahead and filter out 41SCRAP and 41SHOP
						if(this.allReceived[handle].metafields.Location !== undefined) {
							if(this.allReceived[handle].metafields.Location.toLowerCase() == "41shop" || this.allReceived[handle].metafields.Location.toLowerCase() == "41scrap") {
								toFiltered = false;
								continue;
							}
						}
						// go ahead and filter out Sold Products
						if( (this.allReceived[handle].metafields.Condition == "S&D" || this.allReceived[handle].metafields.Condition == "NITB") && this.allReceived[handle].info.variants[0].inventory_quantity <= 0) {
							toFiltered = false;
							continue;
						} else if(this.allReceived[handle].metafields.Condition == undefined) {
							toFiltered = false;
							continue;
						}

						/* check every url filter criteria passed */
						for(var criteria in this.filter_criteria) {
							var clean_criteria = decodeURIComponent(criteria.replace(/\+/g, '%20'));
							if(this.settings.metafields.hasOwnProperty(clean_criteria)) {
								for(var metafield in this.allReceived[handle].metafields) {
									var current_metafield_value = this.allReceived[handle].metafields[metafield];
									if(metafield === criteria) {

										// When multiple url parameters are present,
										// combine results
										if(this.filter_criteria[criteria].constructor == Array) {
											var somethingMatched = false;
											for(var i in this.filter_criteria[criteria]) {
												var current_criteria_value = decodeURIComponent(this.filter_criteria[criteria][i].replace(/\+/g, '%20'));
												if(current_metafield_value === current_criteria_value) {
													somethingMatched = true;
												}
											}
											if(somethingMatched) {
												/* do nothing */
											} else {
												toFiltered = false;
												continue;
											}
										// if a single parameter is present,
										// then filter on that parameter only
										} else {
											var current_criteria_value = decodeURIComponent(this.filter_criteria[criteria].replace(/\+/g, '%20'));
											if(current_metafield_value === current_criteria_value) {
												/* do nothing */
											} else {
												toFiltered = false;
												continue;
											}
										}
									}
								}
								
							} else if(this.settings.tagfields.hasOwnProperty(clean_criteria)) {
								// create a variable which remains false if a filter criteria is found nowhere in a product's tag
								var snagged_tag = false;
								for (var tag in this.allReceived[handle].info.tags) {
									var tagPreValue = this.allReceived[handle].info.tags[tag];
									if (tagPreValue.indexOf("kvp:"+clean_criteria) === 0) {
										snagged_tag = true;
										var splitFields = tagPreValue.split(":");
										var field_name = splitFields[1];
										var field_value = splitFields[2];

										if(field_name == decodeURIComponent(criteria.replace(/\+/g, '%20'))) {	
											if(this.filter_criteria[criteria].constructor == Array) {
												var somethingMatched = false;
												for(var i in this.filter_criteria[criteria]) {
													var current_criteria_value = decodeURIComponent(this.filter_criteria[criteria][i].replace(/\+/g, '%20'));
													if(field_value === current_criteria_value) {
														somethingMatched = true;
													}
												}
												if(somethingMatched) {
													/* do nothing */
												} else {
													toFiltered = false;
													continue;
												}
											// if a single parameter is present,
											// then filter on that parameter only
											} else {
												var current_criteria_value = decodeURIComponent(this.filter_criteria[criteria].replace(/\+/g, '%20'));

												if(current_criteria_value === field_value) {
													/* do nothing */
													if(criteria == "Counter-Depth") {
													}
												} else {
													if(criteria == "Counter-Depth") {
													}
													toFiltered = false;
													continue;
												}
											}
										}
									}
								}
								if(snagged_tag == false) {
									toFiltered = false;
									continue;
								}
							} else if(this.settings.type.enable && criteria == "Type") {
								if(this.filter_criteria[criteria].constructor == Array) { 
									var somethingMatched = false;
									for(var i in this.filter_criteria[criteria]) {
										var current_criteria_value = decodeURIComponent(this.filter_criteria[criteria][i].replace(/\+/g, '%20'));
										if(this.allReceived[handle].info.type === current_criteria_value) {
											somethingMatched = true;
										}
									}
									if(somethingMatched) {
										/* do nothing */
									} else {
										toFiltered = false;
										continue;
									}	
								} else {
									var criteria_value = decodeURIComponent(this.filter_criteria[criteria].replace(/\+/g, '%20'));
									if(this.allReceived[handle].info.type == criteria_value) {
										/* do nothing */
									} else {
										toFiltered = false;
										continue;
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
					loop1:
					for (var handle in load.products) {
						loop2:
						for (var metafield in load.products[handle].metafields) {

							var metafield_value = load.products[handle].metafields[metafield];
							// Make sure this is a filterable property
							if(this.settings.metafields.hasOwnProperty(metafield)) {
								// Do not go further if this option already has a value, prevents 
								// repetitive calculations
								if(this.filter_options.hasOwnProperty(metafield)) {
									if(this.filter_options[metafield].hasOwnProperty(metafield_value)) {
										continue loop2;
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
						loop3:

						for (var i = 0; i < load.products[handle].info.tags.length; i++) {

							var tagPreValue = load.products[handle].info.tags[i];
							if(tagPreValue == "sale") {
								load.products[handle].info.tags.push("kvp:Clearance:On Sale");
							} else if(tagPreValue == "Markdown") {
								load.products[handle].info.tags.push("kvp:Clearance:Marked Down");
							}
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
											continue loop3;
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

						if(this.settings.type.enable) {
							if(this.filter_options["Type"] === undefined) {
								this.filter_options["Type"] = {};
							} else {
								this.filter_options["Type"][load.products[handle].info.type] = {};
								this.filter_options["Type"][load.products[handle].info.type].label = load.products[handle].info.type;
							}
							
						}
						this.allReceived[handle] = load.products[handle];
					}
					console.log("this.allReceived");
					console.log(this.allReceived);
				},
				renderOptions: function() {
					var return_string = "";
					for(var option in this.filter_options) {
						var ui_label = option.toUpperCase();
						if(this.settings.tagfields.hasOwnProperty(option)) {
							ui_label = this.settings.tagfields[option].ui_label;
						} else if(this.settings.metafields.hasOwnProperty(option)) {
							ui_label = this.settings.metafields[option].ui_label;
						}
						if(option.toUpperCase()=="CONDITION"||option.toUpperCase()=="KIND"||option.toUpperCase()=="TYPE"||option.toUpperCase()=="TRUCKLOAD"||option.toUpperCase()=="CLEARANCE") {
							return_string += "<h3 class='active'>"+ui_label+"</h3>";
						} else if(this.filter_criteria.hasOwnProperty(encodeURIComponent(option).replace(/%20/g,"+"))) {
							return_string += "<h3 class='active'>"+ui_label+"</h3>";
						} else {
							return_string += "<h3>"+ui_label+"</h3>";
						}
						return_string += "<ul class=\"tick-boxes\">";
						for(var value in this.filter_options[option]) {
							var valueObject = this.filter_options[option][value];
							var active_string = "";
							// Wrap all strings passed into jquery.param in array literals
							if(this.filter_criteria.hasOwnProperty( encodeURIComponent(option).replace(/%20/g,"+") )) {
								if(this.filter_criteria[encodeURIComponent(option).replace(/%20/g,"+")] === encodeURIComponent(value).replace(/%20/g,"+") ) {
									active_string += "active";
								} else if(this.filter_criteria[encodeURIComponent(option).replace(/%20/g,"+")].constructor === Array) {
									for(var i in this.filter_criteria[encodeURIComponent(option).replace(/%20/g,"+")]) {

										if(this.filter_criteria[encodeURIComponent(option)][i] === encodeURIComponent(value).replace(/%20/g,"+") ) {
											active_string += "active";
										}
									}
								}
							}
							var background_string = "";
							if(value == "Clearance") {
								valueObject.color = "#a56060";
								active_string += " white-tick";
							}
							if(valueObject.color) {
								background_string += "background-color: "+valueObject.color+"; ";
								if(parseInt(valueObject.color.replace("#",""),16) < 10329501) {
									active_string += " white-tick";
								}
							}
							if(valueObject.image) {
								background_string += "background-image: url("+valueObject.image+"); ";
							}
							return_string += "<li><button class=\""+active_string+"\" name=\""+option+"\" value=\""+value+"\"><div class=\"tick-box\" style=\""+background_string+"\"></div>"+valueObject.label+"</button></li>";
						}
						return_string += "</ul>";
					}
					return return_string;
				},
				buildOptions: function() {
					$(this.element).find("#options-go-here").empty();
					$(this.element).find("#options-go-here").addClass("loading").append(this.renderOptions());
			/*
					var $sd_images_button = $('<button class="sd_images btn btn-purple">S&D Photos</button>');
					$(this.element).find("#options-go-here").append($sd_images_button);
			*/
					this.registerActions();
				},
				getAllReceived: function() {
					return this.allReceived;
				},
				trickleToGrid: function() {
					$(".show-results").remove();
					var theCollectionHandle = this.collection_handle;
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
						var sdWithImagesClass = "";
						var last_image = "";
						if(product.info.images.length > 3 && condition == "Scratch & Dent") {
							sdWithImagesClass = "sd-with-images";
							if(product.info.images[product.info.images.length - 1]) {
								last_image = product.info.images[product.info.images.length - 1].replace(".jpeg","_medium.jpeg");
								if(last_image.indexOf(".jpg") > -1) {
									last_image = last_image.replace(".jpg","_medium.jpg");
								}
							}
						}
						var image_string = "";
						var first_image = product.info.images[0];
						var img_class = "";
						if(first_image) {
							if(product.info.vendor == "LG") {
								first_image = first_image.replace(".jpeg","_large.jpeg");
								img_class = product.info.vendor.replace(" ","-");

							} else {
								first_image = first_image.replace(".jpeg","_medium.jpeg");
								img_class = product.info.vendor.replace(" ","-");

							}
						}
						if (product.info.type == "Microwave Oven" || product.info.type == "Ventilation" || product.info.type == "Built-in Oven" || product.info.type == "Room Air Conditioner" || product.info.type == "Cooktop") {
							img_class += " contain";
						}
						if ((product.info.vendor == "LG" && (product.info.type == "Room Air Conditioner" || product.info.type == "Cooktop" || product.info.type == "Microwave Oven" || product.info.type == "Cooking Accessory")) || (product.info.type == "Range" && kvp["Kind"] == "Slide-In") || (product.info.type == "Freezer" && kvp["Kind"] == "Chest")) {
							img_class += " contain_override";
						}
						var locationHTML = "";
/*						if(product.metafields.Location !== undefined) {
							locationHTML = 	[
										'<div class="spec-wrap">',
											'<dt>LOCATION</dt>',
											'<dd>'+product.metafields.Location+'</dd>',
										'</div>'
										].join("");
						}
*/
						var capacityHTML = "";
						if("Total Capacity (cubic feet)" in kvp) {
							capacityHTML = [
								'<div class="spec-wrap">',
									'<dt>CAPACITY</dt>',
									'<dd>'+kvp["Total Capacity (cubic feet)"]+'</dd>',
								'</div>',
							].join("");
						}
						var dBAHTML = "";
						if("dBA" in kvp) {
							dBAHTML = [
								'<div class="spec-wrap">',
									'<dt>Decibals</dt>',
									'<dd>'+kvp["dBA"]+'</dd>',
								'</div>',
							].join("");
						}
						var sonesHTML = "";
						if("Sones" in kvp) {
							sonesHTML = [
								'<div class="spec-wrap">',
									'<dt>Sones</dt>',
									'<dd>'+kvp["Sones"]+'</dd>',
								'</div>',
							].join("");
						}
						var cfmHTML = "";
						if("CFM" in kvp) {
							cfmHTML = [
								'<div class="spec-wrap">',
									'<dt>CFM</dt>',
									'<dd>'+kvp["CFM"]+'</dd>',
								'</div>',
							].join("");
						}
						var widthHTML = "";
						if("Width" in kvp) {
							widthHTML = [
								'<div class="spec-wrap">',
									'<dt>Width</dt>',
									'<dd>'+kvp["Overall Width"]+'</dd>',
								'</div>',
							].join("");
						}
						var heatHTML = "";
						if("Heat Type" in kvp) {
							heatHTML = [
								'<div class="spec-wrap">',
									'<dt>Heat Type</dt>',
									'<dd>'+kvp["Heat Type"]+'</dd>',
								'</div>',
							].join("");
						}

						var titleString = product.info.title;
						if(product.info.vendor == "LG" && product.info.title.indexOf("LG") < 0) {
							titleString = "LG "+titleString;
						}
						titleString = titleString + " &mdash; "+product.info.handle.split("-")[0].toUpperCase();

						var markDownClass = "";
						for(var i in product.info.tags) {
							if(product.info.tags[i] == "Markdown") {
								markDownClass += " clearance";
							} else if(product.info.tags[i] == "sale") {
								markDownClass += " on_sale";
							}
						}

						return [
							"<li id='p"+product.info.id+"' class='"+product.metafields.Condition.toLowerCase().replace("&","")+" "+markDownClass+" "+sdWithImagesClass+"'>",
								'<div class="snapshot">',
									'<a href="/collections/'+theCollectionHandle+'/products/'+product.info.handle+'" class="product-image '+img_class+'" data-first-image="'+first_image+'" data-last-image="'+last_image+'" style="background-image: url(\'http:'+first_image+'\')">',
									'</a>',
								'</div>',
					            '<h4 class="product-title"><a href="/collections/'+theCollectionHandle+'/products/'+product.info.handle+'">'+titleString+'</a></h4>',
									'<dl class="specs">',
										capacityHTML,
										locationHTML,
										dBAHTML,
										cfmHTML,
										sonesHTML,
										heatHTML,
										widthHTML,
										'<div class="spec-wrap">',
											'<dt>MODEL</dt>',
											'<dd>'+product.info.handle.split('-')[0]+'</dd>',
										'</div>',
										'<div class="spec-wrap">',
											'<dt>SERIAL</dt>',
											'<dd>'+product.info.handle.split('-')[1]+'</dd>',
										'</div>',
/*										'<div class="spec-wrap long">',
											'<dt>DIMENSIONS</dt>',
											'<dd>'+kvp["Overall Width"]+'"W x '+kvp["Overall Height"]+'"H x '+kvp["Overall Depth"]+'"D</dd>',
										'</div>',
*/
									'</dl>',
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
					         '</li>',
						].join("");
					};
/*					var pGridIndex = 0;				*/
					var thePrototypeExtension = this;
					var sortedAddToGrid = function($productHouser,$productInsert,cap) {
						var add_to_next = false;
						var placed_item = false;
						if($productHouser.find("li").length > 0) {
							var pg_loop = function(pg_index) {
								var compare_handle = $(this).attr('data-filter-index');
									if(thePrototypeExtension.filtered[compare_handle].info.id == thePrototypeExtension.filtered[handle].info.id) {
										placed_item = true;
										return false;
									} else if(thePrototypeExtension.filtered[handle].info[thePrototypeExtension.sort_property] < thePrototypeExtension.filtered[compare_handle].info[thePrototypeExtension.sort_property]) {
										$(this).before($productInsert);
										if($productHouser.find("li").length > cap) {
											var $stray_item = $productHouser.find("li:last-child");
											add_to_next = $stray_item.clone();
											$stray_item.remove();
										}
										placed_item = true;
										return false;
									} else if(pg_index == $productHouser.find("li").length - 1 && pg_index < (cap - 1)) {
										$(this).after($productInsert);
										placed_item = true;
										return false;
									}
							};
							$productHouser.find("li").each(pg_loop);
						} else {
							$productHouser.append($productInsert);
							placed_item = true;
						}
						return {
							placed_item: placed_item,
							add_to_next: add_to_next
						};
					};
					var filteredEmpty = true;
					var $productGrid = $("ul.product-grid").clone();
					$productGrid.empty();
						for(var handle in this.filtered) {
							filteredEmpty = false;
							var $productInsert = $(renderTemplate(this.filtered[handle])).attr('data-filter-index',handle);
							// Choose where to put the product
							var cap = this.settings.paginate*this.page;
							var results = sortedAddToGrid($productGrid,$productInsert,cap);
							if(results.add_to_next) {
								this.queuedForScroll.unshift(results.add_to_next);
							}
							if(!results.placed_item) {
								if(this.queuedForScroll.length > 0) {
									for(var i in this.queuedForScroll) {
										var filterIndex = $(this.queuedForScroll[i]).attr('data-filter-index');
										var didWhat = 0;
										if(thePrototypeExtension.filtered[filterIndex].info.id == thePrototypeExtension.filtered[handle].info.id) {
											didWhat = 1;
											break;
										} else if(thePrototypeExtension.filtered[handle].info[thePrototypeExtension.sort_property] < thePrototypeExtension.filtered[filterIndex].info[thePrototypeExtension.sort_property]) {
											didWhat = 2;
											this.queuedForScroll.splice(i - 1, 0, $productInsert);
											break;
										} else if(i == this.queuedForScroll.length - 1) {
											didWhat = 3;
											this.queuedForScroll.push($productInsert);
											break;
										}
									}
								} else {
									this.queuedForScroll.push($productInsert);
								}
							}
						}
						$("ul.product-grid").replaceWith($productGrid);
						this.addResultsButton();
						$(this.element).find("ul.product-grid").removeClass("loading");
						if(filteredEmpty && this.all_loads_in) {
							$('ul.product-grid').html([
								"<li class='emtpy-message'>",
									"Nothing matched your filter criteria.",
									"<a href='#' class='clear-all'>",
									"Clear All <i class='icon icon-close'></i>",
									"</a>",
								"</li>",
								].join("")
							);	
						}
						this.getProductNumbers();
						this.afterDump();

				},
				addResultsButton: function() {
						if(this.queuedForScroll.length > 0) {
							var resultsNum = this.settings.paginate;
							if(this.queuedForScroll.length < resultsNum) {
								resultsNum = this.queuedForScroll.length;
							}
							var $showResults = $([
									'<div class="show-results">',
										'<button class="btn btn-purple" id="add-results">',
											'Show '+resultsNum+' more results.',
										'</button>',
									'</div>'
								].join("")
							);
							if($(".show-results").length > 0) {
								$(".show-results").replaceWith($showResults);
							} else {
								$('ul.product-grid').after($showResults);
							}
							var thePrototypeExtension = this;
							$('#add-results').click(function(event) {

								thePrototypeExtension.infiniteScroll();
							});
						} else {
							$(".show-results").replaceWith([
									'<div class="show-results">',
										'<button class="btn disabled" id="add-results">',
											'You\'ve reached the end',
										'</button>',
									'</div>'
								].join("")
							);
						}
				},
				registerActions: function() {
					var thePrototypeExtension = this;
					var $theElement = $(this.element);
					$("ul.tick-boxes button").click(function(event) {
						event.preventDefault();
						$("ul.product-grid").addClass("loading");
				        $(this).toggleClass("active");
				        setTimeout(function() { $theElement.trigger("filterOptionsChanged"); }, 200);

					});
					$("a.clear-all").click(function(event) {
						event.preventDefault();
						$.address.queryString("");
					});

					$('#add-results').click(function(event) {
						thePrototypeExtension.infiniteScroll();
					});
/*
					$("button.sd_images").click(function(event) {
						$(this).toggleClass("active");
						if($(this).hasClass("active")) {
							$('ul.product-grid li').each(function() {
								if($(this).hasClass("sd-with-images")) {
							        var sd_image = $(this).find("a.product-image").data("last-image");
							        var mfg_image = $(this).find("a.product-image").attr("src");
							        if(sd_image) {
							        	$(this).find("a.product-image").data("first-image",mfg_image);
							            $(this).find("a.product-image img").attr("src",sd_image);
							            $(this).addClass("sd-image-activated");
							        } else {
							        	$(this).addClass("sd-no-image-activated");		
							        }
								} else {
							        $(this).addClass("sd-no-image-activated");					
								}
							});
						} else {
							$('ul.product-grid li').each(function() {
								if($(this).hasClass("sd-with-images")) {
							        var mfg_image = $(this).find("a.product-image").data("first-image");
							        $(this).find("a.product-image img").attr("src",mfg_image);
							        $(this).removeClass("sd-image-activated");
								} else {
							        $(this).removeClass("sd-no-image-activated");					
								}
							});
						}
					});
*/
					$(this.element).find("#options-go-here h3").unbind("click");
					$(this.element).find("#options-go-here h3").click(function() {
						$(this).toggleClass("active");
					});
/*					
					$(window).scroll(function() {
						var marginFromBottom = 50;
						console.log(thePrototypeExtension.scroll_adding);
						// determine if the user is at the bottom of the page
						if( ($("body").scrollTop() >= ($("body").height() - $(window).height() - marginFromBottom)) && !thePrototypeExtension.scroll_adding) {
							thePrototypeExtension.scroll_adding = true;
							console.log("You are at the bottom of the page");
							thePrototypeExtension.infiniteScroll();
						}
					});
*/
				},
				setActiveOptionsToHash: function() {
					// wipe out previous hashURL's
		
					var new_values = {};
					$('#options-go-here').find('ul.tick-boxes button.active').each(function() {
							var field_name = $(this).attr("name");
							var field_value = $(this).attr("value");
							if(new_values[field_name] == undefined) {
								new_values[field_name] = [];
							}
							new_values[field_name].push(field_value);
					});

					var new_query_string = jQuery.param( new_values, true);
					$.address.queryString(new_query_string);

				},
				infiniteScroll: function() {
					var thePrototypeExtension = this;
					var addTheStuff = function() {
						$('ul.product-grid').removeClass("adding-products");

						thePrototypeExtension.page = thePrototypeExtension.page + 1;
						var index = 0;
						while(index < thePrototypeExtension.settings.paginate) {
							$('ul.product-grid').append( thePrototypeExtension.queuedForScroll.shift() );
							index++;
						}
						thePrototypeExtension.scroll_adding = false;
					};

/*					if(this.all_loads_in) {		*/
					addTheStuff();
/*					} else {
						$('ul.product-grid').addClass("adding-products");
						$(this.element).on("loadsFinished",function(event) {
							addTheStuff();
						});
					}
*/
					this.addResultsButton();
					this.getProductNumbers();
					this.afterDump();

				},
				afterDump: function() {
					$(this.element).trigger('afterDump');
				},
				getProductNumbers: function() {
					var total_appliances = Object.keys(this.filtered).length;
					var showing_appliances = total_appliances - this.queuedForScroll.length;
					var result_message = "Showing "+showing_appliances+" / "+total_appliances+" Appliances";
					$(".result_count").html(result_message);
				},
				refresh: function() {
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
