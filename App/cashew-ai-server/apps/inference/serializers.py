from rest_framework import serializers


class PredictInputSerializer(serializers.Serializer):
    image = serializers.ImageField(required=True)
