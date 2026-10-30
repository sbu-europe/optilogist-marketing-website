'use strict';
{
    const $ = appCore.jQuery;

    $.fn.appSelect2 = function() {
        $.each(this, function(i, element) {
            $(element).select2({
                ajax: {
                    data: (params) => {
                        return {
                            term: params.term,
                            page: params.page,
                            app_label: element.dataset.appLabel,
                            model_name: element.dataset.modelName,
                            field_name: element.dataset.fieldName
                        };
                    }
                }
            });
        });
        return this;
    };

    $(function() {

        $('.auto-select').not('[name*=__prefix__]').appSelect2();
    });

    document.addEventListener('formset:added', (event) => {
        $(event.target).find('.auto-select').appSelect2();
    });
}
